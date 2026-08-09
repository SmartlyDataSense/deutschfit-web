/**
 * Writing edge-function client (S6 · Task 6.2).
 *
 * Ports `deutschfit-mobile/src/features/writing/{api,types}.ts`. Wraps the
 * three Writing slice endpoints:
 *   - `prompts-list`       (GET)  — `invokeFn`, cached via `loadContent`.
 *   - `prompt-create`      (POST) — `invokeFn`.
 *   - `submissions-create` (POST) — `invokeFn`, `Idempotency-Key` per call.
 *   - `submissions-get/:id` (GET) — delegated to `./submissions::getSubmission`
 *     (the shared unified-submission client; see `getWritingSubmission`).
 *
 * All endpoints require an authenticated caller; RLS on the underlying
 * tables enforces ownership.
 *
 * Web delta (P2): mobile's `listPrompts` fetches an unfiltered list under a
 * single `"prompts-list:writing:all"` cache key and filters client-side.
 * Web parametrizes the cache key by `(examBoard, examLevel)` —
 * `promptsCacheKey` — so the S4 login prefetch
 * (`core/content/prefetchOnLogin.ts`) warms the exact key the compose
 * screen reads instead of a key nothing else populates.
 */
import { ApiError, invokeFn, newIdempotencyKey } from "./client";
import type { DimensionScoresJson, SubmissionStatus } from "./submissions";
import { getSubmission } from "./submissions";
import { invalidateContentCache, loadContent } from "../content/loadContent";
import { mapSubmissionError, type SubmitError } from "./writingErrors";

export type { DimensionScoreWire, DimensionScoresJson } from "./submissions";

/**
 * `prompts-list` row shape (verbatim from mobile `types.ts:17–34`).
 */
export type WritingPrompt = {
  id: string;
  exam_board: string;
  teil: number;
  slug: string;
  title_de: string;
  situation_de: string;
  bullet_points: string[];
  min_words: number;
  max_words: number;
  /**
   * Provenance tag set by `prompts-list`: `"official"` rows are seeded
   * content, `"community"` rows are learner-authored (`createPrompt`).
   * Optional on the wire so a pre-source cache payload still parses; the
   * UI treats a missing value as official.
   */
  source?: "official" | "community";
};

/**
 * `SubmissionStatus` reused from `./submissions` (same union mobile
 * `types.ts:36` declares). `timeout` is a **client-local** status emitted
 * by the polling hook when the wall-clock budget elapses without reaching
 * a terminal state.
 */
export type PollingStatus = SubmissionStatus | "timeout";

/**
 * Feedback JSON shape (verbatim from mobile `types.ts:40–80`). Carries both
 * the legacy Goethe-only fields (`schema_version` 1) and the unified
 * dimension/correction fields (`schema_version` 2).
 */
export type Feedback = {
  // Legacy Goethe-only fields (schema_version 1)
  justifications?: {
    inhalt: string;
    wortschatz_gram: string;
    kommunikation: string;
  };
  model_answer_de: string;
  feedback_de?: string;
  feedback_fr?: string;
  missing_structures?: string[];
  // Unified fields (schema_version 2) — full UnifiedFeedbackJson shape
  dimension_scores?: {
    key: string;
    score: number;
    max_score: 5;
    evidence: string[];
  }[];
  dimension_notes?: Record<string, string>;
  corrections?: {
    original: string;
    corrected: string;
    category: string;
    severity: "minor" | "medium" | "major";
    dimension: string;
    note_de: string;
    note_fr?: string;
  }[];
  personalized_model_de?: string | null;
  focus_areas?: string[];
  examiner_feedback_de?: string;
  coach_feedback_fr?: string;
  next_drill_fr?: string;
  grading_confidence?: "high" | "medium" | "low";
  limitations?: string[];
  authenticity_flags?: {
    likely_memorized: boolean;
    likely_ai_generated: boolean;
    off_task_template: boolean;
  };
};

/**
 * Graded (or grading) writing submission row (verbatim from mobile
 * `types.ts:82–133`), including the v2 four-key text-grader contract
 * (`score`, `off_topic`, `pruefer_text`, `betreuer_text`,
 * `dimension_scores: Record<string, number> | null`) and the board-native
 * headline columns (`score_max`, `pass_floor_points`, migration 0119).
 */
export type WritingSubmission = {
  id: string;
  user_id: string;
  prompt_id: string;
  body_de: string;
  word_count: number;
  status: SubmissionStatus;
  score_inhalt: number | null;
  score_wortschatz_gram: number | null;
  score_kommunikation: number | null;
  feedback_json: Feedback | null;
  grader_version: string | null;
  model_name: string | null;
  graded_at: string | null;
  error_message: string | null;
  created_at: string;
  // Unified grading fields (schema_version 2+); optional on wire (legacy rows omit them)
  schema_version?: number;
  exam_product?: string | null;
  rubric_profile?: string | null;
  grader_family?: "kommunikativ" | "akademisch" | null;
  dimension_scores_json?: DimensionScoresJson | null;
  dimension_notes_json?: Record<string, string> | null;
  official_score_json?: Record<string, unknown> | null;
  normalized_total_pct?: number | null;
  grading_confidence?: "high" | "medium" | "low" | null;
  pass_status?: "pass" | "fail" | "not_evaluated" | null;
  pass_reasons_json?: string[] | null;
  limitations_json?: string[] | null;
  authenticity_flags_json?: {
    likely_memorized: boolean;
    likely_ai_generated: boolean;
    off_task_template: boolean;
  } | null;
  // Text grader v2 four-key contract (PR-D). New text grader rows carry these;
  // legacy rows leave them null and fall back to the old format note.
  score?: number | null;
  off_topic?: boolean | null;
  pruefer_text?: string | null;
  betreuer_text?: string | null;
  // Board-blind canonical flat carrier: telc-B2 = 3 keys, Goethe-B1 = 4 keys.
  dimension_scores?: Record<string, number> | null;
  // Board-native headline columns (migration 0119). `score_max` is the single
  // authoritative point denominator in the board's own nomenclature (telc-B2 →
  // 45, Goethe-B1 → 100); the header renders `score / score_max` and never
  // re-sums dimensions. `pass_floor_points` is the official pass mark carried
  // as DATA per (board, level, skill) — null when the board has no points floor
  // (e.g. Goethe). Both null on legacy + band rows → donut fallback. Derive
  // result_type via `resultTypeFromScoreMax` (no wire field).
  score_max?: number | null;
  pass_floor_points?: number | null;
};

export type CreateSubmissionResult = {
  id: string;
  status: SubmissionStatus;
};

/**
 * Result wrapper returned by `submitWriting()` — the typed entry point the
 * compose screen consumes. Callers branch on `ok` and then on `error.kind`
 * (see `SubmitError` in `writingErrors.ts`) instead of pattern-matching on
 * `Error.message` strings.
 */
export type SubmitWritingResult =
  | { ok: true; value: CreateSubmissionResult }
  | { ok: false; error: SubmitError };

/**
 * Stable cache key for a `(examBoard, examLevel)` prompt list. MUST equal
 * the key `core/content/prefetchOnLogin.ts` warms on login, so the compose
 * screen's first `listPrompts` call hits an already-warm cache row.
 */
export function promptsCacheKey(examBoard: string, examLevel: string): string {
  return `prompts-list:writing:${examBoard}:${examLevel}`;
}

export async function listPrompts(examBoard: string, examLevel: string): Promise<WritingPrompt[]> {
  // The call is deliberately body-less: a GET with a body is invalid
  // (mirrors mobile's rationale for `functions.invoke` — React Native's
  // `fetch` rejects a GET carrying a body).
  const result = await loadContent<{ prompts: WritingPrompt[] }>({
    fnName: "prompts-list",
    cacheKey: promptsCacheKey(examBoard, examLevel),
    method: "GET",
  });
  return result.data.prompts ?? [];
}

/**
 * Payload for `createPrompt()` — a learner-authored community writing prompt.
 *
 * `examBoard` is the unified `<board>-<level>` token (e.g. `"oesd-b1"`); the
 * backend has no board whitelist on `community_writing_prompts`. `teil` is
 * restricted to the values the backend accepts for a community-authored
 * prompt.
 */
export type CreatePromptInput = {
  readonly examBoard: string;
  readonly teil: 1 | 2 | 3;
  readonly titleDe: string;
  readonly minWords: number;
  readonly maxWords: number;
};

/**
 * Author a community writing prompt via the `prompt-create` edge function.
 *
 * On success the cached prompt list for the caller-supplied `invalidate`
 * exam context is invalidated so the new prompt appears on the next list
 * load instead of waiting out the SWR window.
 *
 * Web delta: `invalidateContentCache` is exact-key only (unlike mobile's
 * single `":all"` key that every board/level shares), so only the active
 * exam context's cache row is dropped here — other boards' cached prompt
 * lists keep up to `DEFAULT_TTL_MS` (5 min) of SWR staleness. That's the
 * same staleness class mobile accepts for its single `":all"` key; this
 * residual is scoped to the inactive-context case only.
 *
 * Throws an `Error` whose message is the server `error` code
 * (`invalid_payload` / `invalid_json` / `db_write_failed` / …), or
 * `prompt_create_empty_response` when the 2xx body is malformed, so the
 * screen can branch.
 */
export async function createPrompt(
  input: CreatePromptInput,
  invalidate: { examBoard: string; examLevel: string }
): Promise<WritingPrompt> {
  let data: { prompt: WritingPrompt } | { error: string };
  try {
    data = await invokeFn<{ prompt: WritingPrompt } | { error: string }>("prompt-create", {
      method: "POST",
      body: {
        exam_board: input.examBoard,
        teil: input.teil,
        title_de: input.titleDe,
        min_words: input.minWords,
        max_words: input.maxWords,
      },
    });
  } catch (err) {
    if (err instanceof ApiError) {
      throw new Error(err.code);
    }
    throw err;
  }
  if (!data || typeof data !== "object") {
    throw new Error("prompt_create_empty_response");
  }
  if ("error" in data && typeof data.error === "string") {
    throw new Error(data.error);
  }
  if (!("prompt" in data) || !data.prompt) {
    throw new Error("prompt_create_empty_response");
  }
  await invalidateContentCache(promptsCacheKey(invalidate.examBoard, invalidate.examLevel));
  return data.prompt;
}

/**
 * Typed entry point for the compose screen.
 *
 * Returns a discriminated `SubmitWritingResult` instead of throwing a
 * string-keyed `Error` — the caller branches on `result.ok`, then renders
 * per-kind copy driven by `result.error.kind` (see `SubmitError`).
 *
 * A fresh `Idempotency-Key` (UUID) is generated per call — the backend's
 * idempotency guard rejects writes without one, and a fresh key per attempt
 * lets a retry land as a new submission rather than replaying a stale one.
 *
 * Network failures (no HTTP response landed) are detected two ways:
 *   - `invokeFn` throwing an `ApiError` with no real status (`0`) or the
 *     call throwing a non-`ApiError` at all — `mapSubmissionError` treats
 *     both as `network`.
 *   - A thrown exception out of `invokeFn` itself (e.g. `fetch` rejecting)
 *     is caught here and mapped with `wasNetworkFailure: true`.
 */
export async function submitWriting(args: {
  promptId: string;
  bodyDe: string;
}): Promise<SubmitWritingResult> {
  const idempotencyKey = newIdempotencyKey();
  try {
    const data = await invokeFn<CreateSubmissionResult | { error: string }>("submissions-create", {
      method: "POST",
      body: { prompt_id: args.promptId, body_de: args.bodyDe },
      idempotencyKey,
    });
    if (!data || typeof data !== "object") {
      // No body, no thrown error — treat as an unknown server fault so the
      // screen renders a calm "try again" copy rather than the network
      // banner (which would imply Marie's connection is down).
      return { ok: false, error: { kind: "server", status: 0 } };
    }
    if ("error" in data && typeof data.error === "string") {
      // 2xx envelope with `{ error: "..." }` (legacy server shape). Map the
      // same way a 400 would: surface the discriminator to the screen.
      const fakeError = new ApiError(400, data.error, undefined, data);
      return { ok: false, error: await mapSubmissionError(fakeError) };
    }
    const res = data as CreateSubmissionResult;
    return { ok: true, value: { id: res.id, status: res.status } };
  } catch (err) {
    if (err instanceof ApiError) {
      return { ok: false, error: await mapSubmissionError(err) };
    }
    return {
      ok: false,
      error: await mapSubmissionError(err, { wasNetworkFailure: true }),
    };
  }
}

/**
 * Fetch a graded writing submission row.
 *
 * Delegates to `./submissions::getSubmission(id, "writing")` — the shared
 * `submissions-get?kind=writing` edge-function client. The unified remote
 * shape is a strict superset of `WritingSubmission` for unified rows (the
 * same SELECT clause backs both), so the cast preserves type-safety at the
 * polling-hook boundary while keeping `WritingSubmission` as the public
 * contract for downstream consumers (feedback screen reads `feedback_json`
 * projections through this type).
 */
export async function getWritingSubmission(id: string): Promise<WritingSubmission> {
  const remote = await getSubmission(id, "writing");
  return remote as unknown as WritingSubmission;
}
