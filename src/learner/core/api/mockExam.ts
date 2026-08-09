/**
 * Mock-exam + practice wire client (S4 · Task 4.3).
 *
 * Ports `deutschfit-mobile/src/core/api/mockExam.ts` (858 lines) — same
 * exports, same wire mapping, same error-string contract — with only the
 * transport swapped: `supabase.functions.invoke` → `invokeFn`/`rawGet`
 * (`./client`). The web client throws `ApiError` (not a `{data,error}`
 * envelope) for any non-2xx response, and — unlike supabase-js's generic
 * `FunctionsHttpError.message` — `client.ts`'s `toApiError` already parses
 * the response body into `ApiError.bodyJson`, so an edge function's own
 * `{ error: "<code>" }` is available directly without mobile's bespoke
 * `safeReadErrorBody` dance (kept only for the `mock-exam-start` 409
 * special case, where the body carries `mock_attempt_id`/`status` too —
 * see `startMockExam` below).
 *
 * Contract (server-authoritative), verbatim from mobile:
 *   - `modelltests-list`   (GET)  → `{ modelltests: ModelltestRow[] }`
 *   - `mock-exam-start`    (POST `{ exam_slug, module? }`)
 *       → 201 `{ mock_attempt_id, exam_slug, next_module, lesen_attempt_id, hoeren_attempt_id }` (no `status` key)
 *       → 409 `{ error: 'mock_in_progress', mock_attempt_id, status }`
 *
 * `module` (S5 · Task 5.1, first client of backend #59) selects a
 * single-module drill instead of the full mock — omitted entirely from
 * the request body when not provided (deployed back-compat). The 201
 * response carries no `status` key regardless of `module`; the client
 * fills in the per-module starting status via `defaultStatusForModule`
 * (exhaustive switch mirroring the backend's `STATUS_AT_START` table in
 * `_shared/mock_exam.ts`; module omitted → `in_progress` full mock).
 *   - `mock-exam-advance`  (POST `{ mock_attempt_id, finished_module }`)
 *       → 200 `{ mock_attempt_id, exam_slug, next_module, <next>_attempt_id? }`
 *       → 409 `{ error: 'state_race' }`
 *   - `mock-exam-finalize` (POST `{ mock_attempt_id, answers? }`)
 *       → 200 `{ mock_attempt_id, status: 'finalized', per_competence_report, finalized_at }`
 *       → 409 `{ error: 'not_ready_for_finalize' }`
 *
 * The 409 from `startMockExam` is NOT an error — it's the "resume" signal.
 * `examApi.resumeMockExam` catches `MockExamInProgressError` and converts
 * it into a `StartMockExamResult` with `created: false`.
 *
 * `fetchLesenSession` accepts a two-entry argument:
 *   - a plain `examSlug` string → POST `lesen-start`       (fresh or idempotent-reuse)
 *   - `{ attemptId }`           → POST `lesen-session-get` (hydrate existing attempt)
 * Both return the same nested `{ manifest, module }` envelope so
 * `@/learner/core/exam/engine/loadModel`'s `buildSession` can consume
 * either path without branching on origin. `lesen-session-get` responses
 * carry extra keys (`answers`, `status`, `started_at`, `updated_at`) —
 * this client only reads the keys `LesenSessionPayload` needs and ignores
 * the rest (no strict envelope validation).
 *
 * `normaliseReport` turns the server's `per_competence_report` jsonb into
 * the 4-bar `CompetenceSkills` shape the Results screen consumes.
 */
import type { PracticeLevel } from "../exam/engine/practiceLevel";
import { ApiError, invokeFn, rawGet } from "./client";

export type MockExamModule = "LESEN" | "HOEREN" | "SCHREIBEN" | "SPRECHEN";

export type MockExamStatus =
  | "in_progress"
  | "lesen_done"
  | "hoeren_done"
  | "schreiben_done"
  | "sprechen_done"
  | "finalized"
  | "abandoned";

export interface ModelltestRow {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly cert_code: string;
  readonly level_code: string;
  readonly short_label: string | null;
  readonly sequence_num: number | null;
  /** Only present on the `?module=` filtered branch. */
  readonly module_code?: string;
}

interface RawListModelltestsResponse {
  readonly modelltests?: readonly ModelltestRow[];
}

export interface ListModelltestsArgs {
  readonly module?: MockExamModule;
}

export interface StartMockExamArgs {
  readonly examSlug: string;
  /** Single-module drill selector (S5 · Task 5.1). Omit for a full mock. */
  readonly module?: MockExamModule;
}

export interface StartMockExamResult {
  readonly mockAttemptId: string;
  readonly examSlug: string;
  readonly nextModule: MockExamModule | null;
  readonly lesenAttemptId: string | null;
  /** `null` when absent — including on the resume (409) path. */
  readonly hoerenAttemptId: string | null;
  /** `true` when the 201 path ran; `false` when we resumed via 409. */
  readonly created: boolean;
  readonly status: MockExamStatus;
}

export interface AdvanceMockExamArgs {
  readonly mockAttemptId: string;
  readonly finishedModule: MockExamModule;
}

export interface AdvanceMockExamResult {
  readonly mockAttemptId: string;
  readonly examSlug: string;
  readonly nextModule: MockExamModule | null;
  readonly hoerenAttemptId?: string;
  readonly schreibenSubmissionId?: string;
  readonly finalizeRequired?: boolean;
}

export interface FinalizeMockExamArgs {
  readonly mockAttemptId: string;
  readonly answers?: Readonly<Record<string, string | null>>;
}

export interface FinalizeMockExamResult {
  readonly mockAttemptId: string;
  readonly status: "finalized";
  readonly finalizedAt: string;
  readonly perCompetenceReport: unknown;
  readonly replay: boolean;
}

/**
 * Thrown by `startMockExam` when the server returns 409 "mock_in_progress".
 * Callers `catch` it and switch into the resume flow — hydrate from the
 * local `mockExamCache` row + fetch the active Lesen session.
 */
export class MockExamInProgressError extends Error {
  readonly code = "mock_in_progress" as const;
  readonly mockAttemptId: string;
  readonly status: MockExamStatus;

  constructor(mockAttemptId: string, status: MockExamStatus) {
    super("mock_in_progress");
    this.name = "MockExamInProgressError";
    this.mockAttemptId = mockAttemptId;
    this.status = status;
  }
}

interface RawStartResponse {
  readonly mock_attempt_id?: string;
  readonly exam_slug?: string;
  readonly next_module?: MockExamModule | null;
  readonly lesen_attempt_id?: string | null;
  readonly hoeren_attempt_id?: string | null;
  readonly status?: MockExamStatus;
  readonly error?: string;
}

/**
 * Per-module starting status for the 201 path, which never carries a
 * `status` key. Mirrors the backend's `STATUS_AT_START` table
 * (`deutschfit-backend/supabase/functions/_shared/mock_exam.ts:70–75`):
 * a full mock (`module` omitted) always begins `in_progress` (Lesen
 * active); each single-module drill begins the status the state machine
 * would reach just before that module's own submit endpoint expects it
 * (LESEN → `in_progress`, HOEREN → `lesen_done`, SCHREIBEN →
 * `hoeren_done`, SPRECHEN → `schreiben_done`). Mobile's blanket
 * `"in_progress"` default is a bug for every non-LESEN case — this
 * client must not inherit it, since resume/finalize logic keys off
 * status. The switch below has no `default:` — adding a new
 * `MockExamModule` member must fail this file's typecheck until this
 * function (and the backend table it mirrors) account for it.
 */
function defaultStatusForModule(module: MockExamModule | undefined): MockExamStatus {
  if (module === undefined) return "in_progress"; // full mock — starts at LESEN
  switch (module) {
    case "LESEN":
      return "in_progress";
    case "HOEREN":
      return "lesen_done";
    case "SCHREIBEN":
      return "hoeren_done";
    case "SPRECHEN":
      return "schreiben_done";
  }
}

interface RawAdvanceResponse {
  readonly mock_attempt_id?: string;
  readonly exam_slug?: string;
  readonly next_module?: MockExamModule | null;
  readonly hoeren_attempt_id?: string;
  readonly schreiben_submission_id?: string | null;
  readonly finalize_required?: boolean;
  readonly error?: string;
}

interface RawFinalizeResponse {
  readonly mock_attempt_id?: string;
  readonly status?: "finalized";
  readonly finalized_at?: string;
  readonly per_competence_report?: unknown;
  readonly replay?: boolean;
  readonly error?: string;
}

/**
 * Wire shapes for the Lesen envelope (`lesen-start` / `lesen-session-get`
 * / `lesen-practice-get` / `sprachbausteine-practice-get`), verbatim from
 * mobile's `LesenOption` / `LesenQuestion` / `LesenReadingText` /
 * `LesenPart` / `LesenModule` / `LesenManifest`. The manifest type is
 * named `RawManifest` here (not `LesenManifest`) so it lines up 1:1 with
 * `@/learner/core/exam/engine/loadModel`'s local `RawManifest`/`RawModule`
 * input types — both are read structurally, so `fetchLesenSession`'s
 * result can be passed straight into `buildSession({ manifest, module })`.
 */
export interface LesenOption {
  readonly key: string;
  readonly text: string;
}

export interface LesenQuestion {
  readonly id: string;
  readonly item_number: number;
  readonly stem_de: string | null;
  readonly answer_format: string;
  readonly options: readonly LesenOption[];
  readonly correct_answer: string;
  readonly reading_text_slug: string | null;
}

export interface LesenReadingText {
  readonly slug: string;
  readonly label: string;
  readonly transcript_md: string | null;
}

export interface LesenPart {
  readonly teil_number: number;
  readonly teil_label: string;
  readonly part_kind: string;
  readonly duration_minutes: number;
  readonly instructions_de: string;
  readonly reading_texts: readonly LesenReadingText[];
  readonly questions: readonly LesenQuestion[];
}

export interface LesenModule {
  readonly module_code: "LESEN" | "SPRACHBAUSTEINE";
  readonly source_slug: string;
  readonly parts: readonly LesenPart[];
}

export interface LesenManifestModule {
  readonly code: "LESEN" | "HOEREN" | "SCHREIBEN" | "SPRECHEN" | "SPRACHBAUSTEINE";
  readonly duration_minutes: number;
  readonly item_count: number;
  readonly instructions_de: string;
}

export interface RawManifest {
  readonly modelltest: {
    readonly slug: string;
    readonly title: string;
    readonly short_label: string;
  };
  readonly modules: readonly LesenManifestModule[];
}

export interface LesenSessionPayload {
  readonly attemptId: string | null;
  readonly examSlug: string;
  readonly manifest: RawManifest;
  readonly module: LesenModule;
}

interface RawLesenSessionResponse {
  readonly attempt_id?: string;
  readonly exam_slug?: string;
  readonly manifest?: RawManifest;
  readonly module?: LesenModule;
  readonly error?: string;
}

/**
 * Hören-side mirror of the Lesen envelope (S5 · Task 5.1). Shapes verified
 * against mobile `deutschfit-mobile/src/core/api/mockExam.ts:450–495` —
 * field names align with `@/learner/core/exam/engine/loadModel` so callers
 * reuse the same loader as Lesen/Sprachbausteine.
 */
export interface HoerenAudioTrack {
  readonly slug: string;
  readonly label: string;
  readonly audio_url: string | null;
  readonly audio_missing?: boolean;
  readonly transcript_md?: string | null;
}

export interface HoerenQuestion {
  readonly id: string;
  readonly item_number: number;
  readonly stem_de: string | null;
  readonly answer_format: string;
  readonly options: readonly LesenOption[];
  readonly correct_answer: string;
  readonly audio_track_slug: string | null;
}

export interface HoerenPart {
  readonly teil_number: number;
  readonly teil_label: string;
  readonly part_kind: string;
  readonly duration_minutes: number;
  readonly instructions_de: string;
  readonly audio_tracks: readonly HoerenAudioTrack[];
  readonly questions: readonly HoerenQuestion[];
}

export interface HoerenModule {
  readonly module_code: "HOEREN";
  readonly source_slug: string;
  readonly parts: readonly HoerenPart[];
}

export interface HoerenSessionPayload {
  /** Server attempt id in live (Examen) mode. `null` on the practice path. */
  readonly attemptId: string | null;
  readonly examSlug: string;
  readonly manifest: RawManifest;
  readonly module: HoerenModule;
}

/**
 * Two-entry arg for `fetchHoerenSession`. Exactly one of the fields must be
 * set — `examSlug` to create/reuse an attempt via `hoeren-start`,
 * `attemptId` to hydrate an existing one via `hoeren-session-get`.
 *
 * Web delta: mobile also accepts a plain-string overload
 * (`FetchHoerenSessionArgs | string`, mobile mockExam.ts:582) — deliberately
 * dropped here; only the object form ships.
 */
export type FetchHoerenSessionArgs =
  | { readonly examSlug: string; readonly attemptId?: undefined }
  | { readonly attemptId: string; readonly examSlug?: undefined };

interface RawHoerenSessionResponse {
  readonly attempt_id?: string;
  readonly exam_slug?: string;
  readonly manifest?: RawManifest;
  readonly module?: HoerenModule;
  readonly error?: string;
}

/** One published practice set, as listed by `practice-sets-list`. */
export interface PracticeSetInfo {
  readonly slug: string;
  readonly title: string;
  readonly shortLabel: string | null;
}

type RawPracticeSetsListResponse = {
  readonly error?: string;
  readonly sets?: readonly {
    readonly slug?: unknown;
    readonly title?: unknown;
    readonly short_label?: unknown;
  }[];
};

/** Per-module bar the Results screen renders (mirrors mobile `CompetenceBar`). */
export interface CompetenceBar {
  readonly status: "scored" | "pending" | "deferred" | "missing";
  readonly score: number | null;
  readonly max: number | null;
}

/** 4-bar competence summary derived from `per_competence_report` (mirrors mobile `CompetenceSkills`). */
export interface CompetenceSkills {
  readonly lesen: CompetenceBar;
  readonly hoeren: CompetenceBar;
  readonly schreiben: CompetenceBar;
  readonly sprechen: CompetenceBar;
}

// ---------------------------------------------------------------------------
// Transport-error helpers.
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Web-transport equivalent of mobile's
 * `if (error) throw new Error(error.message || "<prefix>_failed")` combined
 * with mobile's `if (data.error) throw new Error(data.error)` check for a
 * soft-error 2xx body. `invokeFn`/`rawGet` throw `ApiError` for any non-2xx
 * response, and `client.ts`'s `toApiError` already parses the JSON body
 * into `ApiError.bodyJson` — so a known server error code (`rate_limited`,
 * `state_race`, `not_ready_for_finalize`, `attempt_not_submittable`, …)
 * surfaces as `Error(code)`, matching mobile's `data.error` throw. A body
 * without a parseable `error` field (network failure, 5xx with no JSON
 * body) falls back to the mobile-spelled `<prefix>_failed`.
 */
function rethrowTransportError(err: unknown, prefix: string): never {
  if (err instanceof ApiError) {
    const body = err.bodyJson;
    const code = isRecord(body) && typeof body.error === "string" ? body.error : undefined;
    throw new Error(code ?? `${prefix}_failed`);
  }
  throw err instanceof Error ? err : new Error(`${prefix}_failed`);
}

// ---------------------------------------------------------------------------
// Modelltests + mock-exam orchestration.
// ---------------------------------------------------------------------------

export async function listModelltests(args: ListModelltestsArgs = {}): Promise<ModelltestRow[]> {
  let raw: RawListModelltestsResponse;
  try {
    raw = await rawGet<RawListModelltestsResponse>(
      "modelltests-list",
      args.module ? { module: args.module } : undefined
    );
  } catch (err) {
    rethrowTransportError(err, "modelltests_list");
  }
  return raw.modelltests ? [...raw.modelltests] : [];
}

/**
 * Start — or resume — a mock exam. On 409 "mock_in_progress" we extract
 * `mock_attempt_id`/`status` from `ApiError.bodyJson` (guarding both keys
 * are present, exactly like mobile's `safeReadErrorBody` extraction) and
 * throw the typed `MockExamInProgressError`. A malformed 409 body (missing
 * either key) falls through to the generic `mock_exam_start_failed` string
 * rather than leaking the raw `mock_in_progress` code as a bare error.
 */
export async function startMockExam(args: StartMockExamArgs): Promise<StartMockExamResult> {
  let raw: RawStartResponse;
  try {
    raw = await invokeFn<RawStartResponse>("mock-exam-start", {
      method: "POST",
      // `module` omitted entirely (not sent as `undefined`) when absent —
      // deployed back-compat with the pre-#59 endpoint contract.
      body: args.module
        ? { exam_slug: args.examSlug, module: args.module }
        : { exam_slug: args.examSlug },
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      const body = err.bodyJson;
      if (
        isRecord(body) &&
        typeof body.mock_attempt_id === "string" &&
        typeof body.status === "string"
      ) {
        throw new MockExamInProgressError(body.mock_attempt_id, body.status as MockExamStatus);
      }
      throw new Error("mock_exam_start_failed");
    }
    rethrowTransportError(err, "mock_exam_start");
  }

  if (!raw) {
    throw new Error("mock_exam_start_empty_response");
  }
  if (raw.error) {
    throw new Error(raw.error);
  }
  if (!raw.mock_attempt_id || !raw.exam_slug) {
    throw new Error("mock_exam_start_malformed_response");
  }

  return {
    mockAttemptId: raw.mock_attempt_id,
    examSlug: raw.exam_slug,
    nextModule: raw.next_module ?? "LESEN",
    lesenAttemptId: raw.lesen_attempt_id ?? null,
    hoerenAttemptId: raw.hoeren_attempt_id ?? null,
    created: true,
    status: raw.status ?? defaultStatusForModule(args.module),
  };
}

export async function advanceMockExam(args: AdvanceMockExamArgs): Promise<AdvanceMockExamResult> {
  let raw: RawAdvanceResponse;
  try {
    raw = await invokeFn<RawAdvanceResponse>("mock-exam-advance", {
      method: "POST",
      body: {
        mock_attempt_id: args.mockAttemptId,
        finished_module: args.finishedModule,
      },
    });
  } catch (err) {
    rethrowTransportError(err, "mock_exam_advance");
  }

  if (!raw) {
    throw new Error("mock_exam_advance_empty_response");
  }
  if (raw.error) {
    throw new Error(raw.error);
  }
  if (!raw.mock_attempt_id || !raw.exam_slug) {
    throw new Error("mock_exam_advance_malformed_response");
  }

  return {
    mockAttemptId: raw.mock_attempt_id,
    examSlug: raw.exam_slug,
    nextModule: raw.next_module ?? null,
    ...(raw.hoeren_attempt_id !== undefined ? { hoerenAttemptId: raw.hoeren_attempt_id } : {}),
    ...(raw.schreiben_submission_id !== undefined
      ? { schreibenSubmissionId: raw.schreiben_submission_id ?? undefined }
      : {}),
    ...(raw.finalize_required !== undefined ? { finalizeRequired: raw.finalize_required } : {}),
  };
}

export async function finalizeMockExam(
  args: FinalizeMockExamArgs
): Promise<FinalizeMockExamResult> {
  const body: Record<string, unknown> = { mock_attempt_id: args.mockAttemptId };
  if (args.answers) {
    body.answers = args.answers;
  }

  let raw: RawFinalizeResponse;
  try {
    raw = await invokeFn<RawFinalizeResponse>("mock-exam-finalize", { method: "POST", body });
  } catch (err) {
    rethrowTransportError(err, "mock_exam_finalize");
  }

  if (!raw) {
    throw new Error("mock_exam_finalize_empty_response");
  }
  if (raw.error) {
    throw new Error(raw.error);
  }
  if (
    !raw.mock_attempt_id ||
    raw.status !== "finalized" ||
    !raw.per_competence_report ||
    !raw.finalized_at
  ) {
    throw new Error("mock_exam_finalize_malformed_response");
  }

  return {
    mockAttemptId: raw.mock_attempt_id,
    status: "finalized",
    finalizedAt: raw.finalized_at,
    perCompetenceReport: raw.per_competence_report,
    replay: Boolean(raw.replay),
  };
}

// ---------------------------------------------------------------------------
// Lesen session — two-entry dispatch.
// ---------------------------------------------------------------------------

export async function fetchLesenSession(
  examSlugOrRef: string | { readonly attemptId: string }
): Promise<LesenSessionPayload> {
  const isAttemptRef = typeof examSlugOrRef !== "string";
  const fn = isAttemptRef ? "lesen-session-get" : "lesen-start";
  const prefix = isAttemptRef ? "lesen_session_get" : "lesen_start";
  const body = isAttemptRef
    ? { attempt_id: examSlugOrRef.attemptId }
    : { exam_slug: examSlugOrRef };

  let raw: RawLesenSessionResponse;
  try {
    raw = await invokeFn<RawLesenSessionResponse>(fn, { method: "POST", body });
  } catch (err) {
    rethrowTransportError(err, prefix);
  }

  if (!raw) {
    throw new Error(`${prefix}_empty_response`);
  }
  if (raw.error) {
    throw new Error(raw.error);
  }
  if (!raw.attempt_id || !raw.exam_slug || !raw.manifest || !raw.module) {
    throw new Error(`${prefix}_malformed_response`);
  }

  return {
    attemptId: raw.attempt_id,
    examSlug: raw.exam_slug,
    manifest: raw.manifest,
    module: raw.module,
  };
}

/**
 * Hören-side mirror of `fetchLesenSession` (mobile `582–635`). Two-entry
 * dispatch: `attemptId` → `hoeren-session-get {attempt_id}`, `examSlug` →
 * `hoeren-start {exam_slug}`. Both return the same nested envelope shape;
 * `hoeren-session-get` responses carry extra keys (`answers`, `status`,
 * …) that this client ignores.
 */
export async function fetchHoerenSession(
  args: FetchHoerenSessionArgs
): Promise<HoerenSessionPayload> {
  const isAttemptRef = args.attemptId !== undefined;
  const fn = isAttemptRef ? "hoeren-session-get" : "hoeren-start";
  const prefix = isAttemptRef ? "hoeren_session_get" : "hoeren_start";
  const body = isAttemptRef ? { attempt_id: args.attemptId } : { exam_slug: args.examSlug };

  let raw: RawHoerenSessionResponse;
  try {
    raw = await invokeFn<RawHoerenSessionResponse>(fn, { method: "POST", body });
  } catch (err) {
    rethrowTransportError(err, prefix);
  }

  if (!raw) {
    throw new Error(`${prefix}_empty_response`);
  }
  if (raw.error) {
    throw new Error(raw.error);
  }
  if (!raw.attempt_id || !raw.exam_slug || !raw.manifest || !raw.module) {
    throw new Error(`${prefix}_malformed_response`);
  }

  return {
    attemptId: raw.attempt_id,
    examSlug: raw.exam_slug,
    manifest: raw.manifest,
    module: raw.module,
  };
}

type TextPracticeFn = "lesen-practice-get" | "sprachbausteine-practice-get";

/**
 * Shared fetch for the untimed text-practice endpoints. Both return the
 * Lesen wire shape without an attempt row; `attemptId` is always `null`.
 */
async function fetchTextPracticeSession(
  fn: TextPracticeFn,
  level: PracticeLevel,
  slug?: string
): Promise<LesenSessionPayload> {
  const prefix = fn.replace(/-/g, "_");
  const body: Record<string, unknown> = slug ? { level, slug } : { level };

  let raw: RawLesenSessionResponse;
  try {
    raw = await invokeFn<RawLesenSessionResponse>(fn, { method: "POST", body });
  } catch (err) {
    rethrowTransportError(err, prefix);
  }

  if (!raw) {
    throw new Error(`${prefix}_empty_response`);
  }
  if (raw.error) {
    throw new Error(raw.error);
  }
  if (!raw.exam_slug || !raw.manifest || !raw.module) {
    throw new Error(`${prefix}_malformed_response`);
  }

  return {
    attemptId: null,
    examSlug: raw.exam_slug,
    manifest: raw.manifest,
    module: raw.module,
  };
}

export async function fetchLesenPracticeSession(
  level: PracticeLevel,
  slug?: string
): Promise<LesenSessionPayload> {
  return fetchTextPracticeSession("lesen-practice-get", level, slug);
}

export async function fetchSprachbausteinePracticeSession(
  level: PracticeLevel,
  slug?: string
): Promise<LesenSessionPayload> {
  return fetchTextPracticeSession("sprachbausteine-practice-get", level, slug);
}

/**
 * Apprendre (Pratique) Hören practice fetch (mobile `651–677`). Calls the
 * read-only `hoeren-practice-get` edge function, which creates no
 * `hoeren_attempts` row and applies no rate limit — grading is local, so
 * the payload legitimately carries `correct_answer`. The guard checks
 * `exam_slug` / `manifest` / `module` only (no `attempt_id` check, unlike
 * the live `fetchHoerenSession`); `attemptId` is always `null`, even if the
 * server happens to echo an `attempt_id`.
 *
 * Web delta: `slug?` param (P14) — mobile takes level only.
 */
export async function fetchHoerenPracticeSession(
  level: PracticeLevel,
  slug?: string
): Promise<HoerenSessionPayload> {
  const body: Record<string, unknown> = slug ? { level, slug } : { level };

  let raw: RawHoerenSessionResponse;
  try {
    raw = await invokeFn<RawHoerenSessionResponse>("hoeren-practice-get", {
      method: "POST",
      body,
    });
  } catch (err) {
    rethrowTransportError(err, "hoeren_practice_get");
  }

  if (!raw) {
    throw new Error("hoeren_practice_get_empty_response");
  }
  if (raw.error) {
    throw new Error(raw.error);
  }
  if (!raw.exam_slug || !raw.manifest || !raw.module) {
    throw new Error("hoeren_practice_get_malformed_response");
  }

  return {
    attemptId: null,
    examSlug: raw.exam_slug,
    manifest: raw.manifest,
    module: raw.module,
  };
}

/**
 * Enumerates the published practice sets for a (level, module) cell via
 * `practice-sets-list`, ordered slug asc. An empty cell is a valid state
 * and returns `[]`.
 */
export async function fetchPracticeSetsList(
  level: PracticeLevel,
  module: "LESEN" | "SPRACHBAUSTEINE" | "HOEREN"
): Promise<PracticeSetInfo[]> {
  let raw: RawPracticeSetsListResponse;
  try {
    raw = await invokeFn<RawPracticeSetsListResponse>("practice-sets-list", {
      method: "POST",
      body: { level, module },
    });
  } catch (err) {
    rethrowTransportError(err, "practice_sets_list");
  }

  if (!raw) {
    throw new Error("practice_sets_list_empty_response");
  }
  if (raw.error) {
    throw new Error(raw.error);
  }
  if (!Array.isArray(raw.sets)) {
    throw new Error("practice_sets_list_malformed_response");
  }

  const sets: PracticeSetInfo[] = [];
  for (const row of raw.sets) {
    if (typeof row.slug !== "string" || row.slug.length === 0) {
      throw new Error("practice_sets_list_malformed_response");
    }
    sets.push({
      slug: row.slug,
      title: typeof row.title === "string" ? row.title : row.slug,
      shortLabel: typeof row.short_label === "string" ? row.short_label : null,
    });
  }
  return sets;
}

// ---------------------------------------------------------------------------
// Report shaping.
// ---------------------------------------------------------------------------

function normaliseModule(value: unknown): CompetenceBar {
  if (!isRecord(value)) {
    return { status: "missing", score: null, max: null };
  }
  const status: CompetenceBar["status"] =
    value.status === "scored" || value.status === "pending" || value.status === "deferred"
      ? value.status
      : "missing";
  const raw = typeof value.raw_score === "number" ? value.raw_score : null;
  const scaled = typeof value.scaled_score === "number" ? value.scaled_score : null;
  const max = typeof value.max_score === "number" ? value.max_score : null;
  return {
    status,
    // Prefer scaled if present (normalised to a standard scale); fall back to raw.
    score: scaled ?? raw,
    max,
  };
}

/**
 * Shape-check + fold the server's `per_competence_report` into the 4-bar
 * `CompetenceSkills` payload the Results screen consumes. Missing modules
 * degrade to `{ status: 'missing', score: null, max: null }`.
 */
export function normaliseReport(report: unknown): CompetenceSkills {
  const r = isRecord(report) ? report : {};
  return {
    lesen: normaliseModule(r.lesen),
    hoeren: normaliseModule(r.hoeren),
    schreiben: normaliseModule(r.schreiben),
    sprechen: normaliseModule(r.sprechen),
  };
}
