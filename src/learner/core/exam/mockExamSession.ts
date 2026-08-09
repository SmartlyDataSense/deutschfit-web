/**
 * Mock-exam session service (S4 · Task 4.3) — glue between the edge-fn
 * client (`@/learner/core/api/mockExam`) and the local Dexie
 * `mockExamCache` mirror.
 *
 * Port of `deutschfit-mobile/src/features/simulation/services/session.ts`
 * onto Dexie's `getLearnerDb().mockExamCache` table (composite PK
 * `[user_id, modelltest_slug]` — see `@/learner/core/db/schema.ts`).
 *
 * Simplification vs mobile (documented, not silent): mobile's
 * Drizzle-sqlite build has no first-class `onConflictDoUpdate` for
 * composite PKs, so its `upsertCacheRow` emulates "read-then-update-or-
 * insert". Dexie's `put()` is a native upsert against the composite key
 * (IndexedDB replaces-on-existing-key by design), so the read-then-branch
 * step is dropped here — one `put` call does the whole job.
 *
 * The cache row carries *orchestration state* only (attempt id + status).
 * Answers are NOT cached here — Lesen answers live in the exam-player
 * reducer (`useExamPlayer`) and only get flushed to the server on
 * advance/finalize, per the "no offline submission queue" rule.
 */
import {
  advanceMockExam,
  fetchLesenSession,
  finalizeMockExam,
  MockExamInProgressError,
  startMockExam,
  type AdvanceMockExamResult,
  type FinalizeMockExamResult,
  type LesenSessionPayload,
  type MockExamModule,
  type MockExamStatus,
  type StartMockExamResult,
} from "../api/mockExam";
import { getLearnerDb } from "../db";
import type { MockExamCacheRow } from "../db/types";

export type { MockExamModule, MockExamStatus };

export interface StartSessionArgs {
  readonly userId: string;
  readonly examSlug: string;
  /** Single-module drill selector (S5 · Task 5.1), threaded to `startMockExam`. */
  readonly module?: MockExamModule;
}

export interface SessionHandle {
  readonly mockAttemptId: string;
  readonly examSlug: string;
  readonly status: MockExamStatus;
  readonly nextModule: MockExamModule | null;
  readonly lesenAttemptId: string | null;
  /**
   * Hören attempt id when `module: "HOEREN"` was requested and the 201
   * path ran. `null` on the 409 resume path — the resume body doesn't
   * carry it (feeds P7).
   */
  readonly hoerenAttemptId: string | null;
  /** `true` when we just created the attempt, `false` when we resumed. */
  readonly resumed: boolean;
}

export interface AdvanceSessionArgs {
  readonly userId: string;
  readonly examSlug: string;
  readonly mockAttemptId: string;
  readonly finishedModule: MockExamModule;
}

export interface FinalizeSessionArgs {
  readonly userId: string;
  readonly examSlug: string;
  readonly mockAttemptId: string;
  readonly answers?: Readonly<Record<string, string | null>>;
}

/**
 * Local cache row shape, re-exported so screen-side code can read the
 * composite-key row without reaching into the raw (snake_case) Dexie row.
 */
export interface MockExamCacheRecord {
  readonly userId: string;
  readonly modelltestSlug: string;
  readonly mockAttemptId: string;
  readonly status: MockExamStatus;
  readonly finalizedAt: number | null;
  readonly updatedAt: number;
}

function toRow(record: MockExamCacheRecord): MockExamCacheRow {
  return {
    user_id: record.userId,
    modelltest_slug: record.modelltestSlug,
    mock_attempt_id: record.mockAttemptId,
    status: record.status,
    finalized_at: record.finalizedAt,
    updated_at: record.updatedAt,
  };
}

function fromRow(row: MockExamCacheRow): MockExamCacheRecord {
  return {
    userId: row.user_id,
    modelltestSlug: row.modelltest_slug,
    mockAttemptId: row.mock_attempt_id,
    status: row.status as MockExamStatus,
    finalizedAt: row.finalized_at,
    updatedAt: row.updated_at,
  };
}

/** Upsert = plain `put` — Dexie's composite PK handles insert-or-replace natively. */
async function upsertCacheRow(record: MockExamCacheRecord): Promise<void> {
  const db = await getLearnerDb();
  await db.mockExamCache.put(toRow(record) as unknown as Record<string, unknown>);
}

export async function readCacheRow(
  userId: string,
  examSlug: string
): Promise<MockExamCacheRecord | null> {
  const db = await getLearnerDb();
  const row = await db.mockExamCache.get([userId, examSlug]);
  if (!row) return null;
  return fromRow(row as unknown as MockExamCacheRow);
}

/**
 * Hub-side lookup. Returns the single non-terminal (`in_progress` or a
 * module-complete intermediate) cache row for this user, if any — used to
 * surface a "Resume mock exam" CTA on cold start. The server still
 * enforces the single-in-progress rule; this query is read-only UI sugar
 * so the hub doesn't have to iterate over every published modelltest.
 */
export async function readPendingMockExam(userId: string): Promise<MockExamCacheRecord | null> {
  const db = await getLearnerDb();
  const rows = await db.mockExamCache.whereEquals("user_id", userId);
  const pending = rows.find((r) => {
    const status = (r as unknown as MockExamCacheRow).status as MockExamStatus;
    return (
      status === "in_progress" ||
      status === "lesen_done" ||
      status === "hoeren_done" ||
      status === "schreiben_done" ||
      status === "sprechen_done"
    );
  });
  if (!pending) return null;
  return fromRow(pending as unknown as MockExamCacheRow);
}

/**
 * Start — or resume — a mock exam. On 409 we catch the typed
 * `MockExamInProgressError`, cache the server-provided attempt id, and
 * return a `resumed: true` handle. Callers then call `resumeSession` to
 * hydrate the Lesen items (or skip that step if the cached status has
 * already moved past LESEN).
 */
export async function startSession(
  args: StartSessionArgs,
  now: number = Date.now()
): Promise<SessionHandle> {
  try {
    const created: StartMockExamResult = await startMockExam({
      examSlug: args.examSlug,
      ...(args.module ? { module: args.module } : {}),
    });
    await upsertCacheRow({
      userId: args.userId,
      modelltestSlug: args.examSlug,
      mockAttemptId: created.mockAttemptId,
      status: created.status,
      finalizedAt: null,
      updatedAt: now,
    });
    return {
      mockAttemptId: created.mockAttemptId,
      examSlug: created.examSlug,
      status: created.status,
      nextModule: created.nextModule,
      lesenAttemptId: created.lesenAttemptId,
      hoerenAttemptId: created.hoerenAttemptId,
      resumed: false,
    };
  } catch (err) {
    if (err instanceof MockExamInProgressError) {
      await upsertCacheRow({
        userId: args.userId,
        modelltestSlug: args.examSlug,
        mockAttemptId: err.mockAttemptId,
        status: err.status,
        finalizedAt: null,
        updatedAt: now,
      });
      return {
        mockAttemptId: err.mockAttemptId,
        examSlug: args.examSlug,
        status: err.status,
        nextModule: nextModuleForStatus(err.status),
        lesenAttemptId: null,
        hoerenAttemptId: null,
        resumed: true,
      };
    }
    throw err;
  }
}

/** Advance the mock-exam state machine. Updates the cache on the way back. */
export async function advanceSession(
  args: AdvanceSessionArgs,
  now: number = Date.now()
): Promise<AdvanceMockExamResult> {
  const result = await advanceMockExam({
    mockAttemptId: args.mockAttemptId,
    finishedModule: args.finishedModule,
  });

  // Derive the new cached status from the module we just finished, not
  // from the server response (the advance endpoint returns `next_module`,
  // not the status — status is owned by the DB + re-read on finalize).
  const nextStatus = statusForFinishedModule(args.finishedModule);
  await upsertCacheRow({
    userId: args.userId,
    modelltestSlug: args.examSlug,
    mockAttemptId: result.mockAttemptId,
    status: nextStatus,
    finalizedAt: null,
    updatedAt: now,
  });
  return result;
}

/**
 * Resume a mock-exam session. Reads the cache first (offline-friendly),
 * then optionally hydrates Lesen items when the cached status is still
 * pre-LESEN / LESEN-in-progress.
 *
 * Returns `null` when no row is cached for this user × slug — the caller
 * should then fall through to `startSession`.
 */
export async function resumeSession(args: {
  readonly userId: string;
  readonly examSlug: string;
  /** Skip the `lesen-start` hydration (tests, offline cold starts). */
  readonly skipHydrate?: boolean;
}): Promise<{
  readonly cache: MockExamCacheRecord;
  readonly lesen: LesenSessionPayload | null;
} | null> {
  const cache = await readCacheRow(args.userId, args.examSlug);
  if (!cache) return null;
  if (args.skipHydrate) return { cache, lesen: null };
  if (cache.status !== "in_progress") {
    return { cache, lesen: null };
  }
  try {
    const lesen = await fetchLesenSession(args.examSlug);
    return { cache, lesen };
  } catch {
    // Network failure on resume — caller can still render a "tap to
    // retry" state using the cached status.
    return { cache, lesen: null };
  }
}

/**
 * Finalize a mock-exam attempt. `answers` is forwarded even though the
 * server currently ignores it — mirrors mobile, which still sends it as a
 * forward-compat passthrough for future server-side answer reconciliation.
 */
export async function finalizeSession(
  args: FinalizeSessionArgs,
  now: number = Date.now()
): Promise<FinalizeMockExamResult> {
  const payload = args.answers
    ? { mockAttemptId: args.mockAttemptId, answers: args.answers }
    : { mockAttemptId: args.mockAttemptId };
  const result = await finalizeMockExam(payload);
  await upsertCacheRow({
    userId: args.userId,
    modelltestSlug: args.examSlug,
    mockAttemptId: result.mockAttemptId,
    status: "finalized",
    finalizedAt: Date.parse(result.finalizedAt) || now,
    updatedAt: now,
  });
  return result;
}

/**
 * Map a module the caller *just finished* to the cached status that
 * reflects it. The server DB owns the canonical transition; this is a
 * read-model optimisation so the UI can re-open the cache and know what
 * to render without waiting for another round trip.
 */
function statusForFinishedModule(m: MockExamModule): MockExamStatus {
  switch (m) {
    case "LESEN":
      return "lesen_done";
    case "HOEREN":
      return "hoeren_done";
    case "SCHREIBEN":
      return "schreiben_done";
    case "SPRECHEN":
      return "sprechen_done";
  }
}

/**
 * Inverse of the above: given a cached status, the module the candidate
 * should land on when they resume. `in_progress` means LESEN hasn't been
 * finished yet — land on LESEN. Terminal statuses (`finalized`,
 * `abandoned`) map to `null` so the screen can bounce to the results /
 * hub screen.
 */
function nextModuleForStatus(s: MockExamStatus): MockExamModule | null {
  switch (s) {
    case "in_progress":
      return "LESEN";
    case "lesen_done":
      return "HOEREN";
    case "hoeren_done":
      return "SCHREIBEN";
    case "schreiben_done":
      return "SPRECHEN";
    case "sprechen_done":
    case "finalized":
    case "abandoned":
      return null;
  }
}
