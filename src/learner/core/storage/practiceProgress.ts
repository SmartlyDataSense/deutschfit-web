/**
 * CRUD for `practice_progress` — client-only persistence for the untimed
 * practice surface (§6.5). One row per user × exam context × module ×
 * quiz. Holds the first-pick locks (item id → picked key + verdict) and
 * the running score. There is NO server copy: practice is not a graded
 * attempt and never creates submissions/attempt rows.
 *
 * Port of `deutschfit-mobile/src/core/storage/practiceProgress.ts`
 * (Drizzle → Dexie via `getLearnerDb()`). The public API mirrors mobile's
 * camelCase `PracticeProgressRecord`; the snake_case `PracticeProgressRow`
 * (`core/db/types.ts`) is the Dexie row and stays internal to this
 * module — mapping between the two happens only at this boundary.
 *
 * `listPracticeProgress` delta from mobile: Drizzle's
 * `and(eq(userId), eq(board), eq(level))` becomes a single
 * `whereEquals("user_id", userId)` (Dexie query) followed by an in-JS
 * filter on `board` + `level` — `getLearnerDb()`'s in-memory fallback
 * table (used when IndexedDB is unavailable) only supports single-field
 * `whereEquals`, so multi-field filtering has to happen in JS regardless
 * of which backend is live.
 */
import { getLearnerDb } from "@/learner/core/db";
import type { PracticeAnswerEntry, PracticeProgressRow } from "@/learner/core/db/types";

export interface PracticeProgressKey {
  readonly userId: string;
  readonly board: string;
  readonly level: string;
  readonly moduleCode: string;
  readonly quizSlug: string;
}

export interface PracticeProgressRecord extends PracticeProgressKey {
  readonly answers: Readonly<Record<string, PracticeAnswerEntry>>;
  readonly correctCount: number;
  readonly totalCount: number;
  readonly completedAt: number | null;
  readonly updatedAt: number;
}

function rowToRecord(row: PracticeProgressRow): PracticeProgressRecord {
  return {
    userId: row.user_id,
    board: row.board,
    level: row.level,
    moduleCode: row.module_code,
    quizSlug: row.quiz_slug,
    answers: row.answers,
    correctCount: row.correct_count,
    totalCount: row.total_count,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  };
}

function recordToRow(record: PracticeProgressRecord): PracticeProgressRow {
  return {
    user_id: record.userId,
    board: record.board,
    level: record.level,
    module_code: record.moduleCode,
    quiz_slug: record.quizSlug,
    answers: record.answers as Record<string, PracticeAnswerEntry>,
    correct_count: record.correctCount,
    total_count: record.totalCount,
    completed_at: record.completedAt,
    updated_at: record.updatedAt,
  };
}

export async function listPracticeProgress(
  userId: string,
  board: string,
  level: string
): Promise<PracticeProgressRecord[]> {
  const db = await getLearnerDb();
  const rows = (await db.practiceProgress.whereEquals(
    "user_id",
    userId
  )) as unknown as PracticeProgressRow[];
  return rows.filter((row) => row.board === board && row.level === level).map(rowToRecord);
}

export async function loadPracticeProgress(
  key: PracticeProgressKey
): Promise<PracticeProgressRecord | null> {
  const db = await getLearnerDb();
  const row = (await db.practiceProgress.get([
    key.userId,
    key.board,
    key.level,
    key.moduleCode,
    key.quizSlug,
  ])) as PracticeProgressRow | undefined;
  return row ? rowToRecord(row) : null;
}

/** Upsert — Dexie `put` on the composite primary key. */
export async function savePracticeProgress(record: PracticeProgressRecord): Promise<void> {
  const db = await getLearnerDb();
  await db.practiceProgress.put(recordToRow(record) as unknown as Record<string, unknown>);
}
