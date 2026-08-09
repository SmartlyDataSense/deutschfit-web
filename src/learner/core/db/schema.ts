/**
 * Dexie schema for the learner IndexedDB (`deutschfit-learner`, v1).
 *
 * Table set + key paths mirror `deutschfit-mobile`'s Drizzle schemas
 * (`deutschfit-mobile/src/core/db/schema/*.ts` + `migrations.ts`) so the
 * web learner app persists the same shapes offline that the mobile app
 * does. Table *names* are camelCase (web JS convention); row *field*
 * names stay `snake_case` to mirror mobile 1:1 (see `types.ts`).
 *
 * Each table's Dexie index string encodes:
 *   - the primary key (mobile's single-column PK or composite PK, using
 *     Dexie's `[a+b]` compound-index syntax where mobile uses a
 *     composite PK), and
 *   - the extra indexes mobile queries by, taken from the mirrored raw
 *     SQL indexes in mobile's `migrations.ts` (`srs_cards_next_due_idx`,
 *     `srs_reviews_card_id_idx`, `mock_exam_cache_user_idx`,
 *     `drill_sessions_completed_at_idx`) plus the lookup patterns used
 *     by mobile call sites that don't have a dedicated SQL index today
 *     (drafts looked up by `prompt_id` alone; the outbox drained FIFO by
 *     `queued_at`).
 *
 * IndexedDB only ever stores the fields listed as indexes in the schema
 * string — every other field is still stored on the row, just not
 * queryable via `.where()`.
 */
import Dexie from "dexie";

/** IndexedDB database name — must stay stable across releases (renaming loses local data). */
export const LEARNER_DB_NAME = "deutschfit-learner";

/** Dexie schema version. Bump + add a new `.version()` block for any future migration. */
export const LEARNER_DB_VERSION = 1;

export const LEARNER_TABLE_NAMES = [
  "writingDrafts",
  "srsCards",
  "srsReviews",
  "contentCache",
  "userStats",
  "mockExamCache",
  "cachedTopics",
  "activeSubmission",
  "drillSessions",
  "drillAttemptOutbox",
  "practiceProgress",
] as const;

export type LearnerTableName = (typeof LEARNER_TABLE_NAMES)[number];

interface TableIndexSpec {
  /** Ordered primary-key field(s). Length > 1 renders as a Dexie compound key `[a+b]`. */
  readonly primaryKey: readonly string[];
  /** Additional single or compound indexes, beyond the primary key. */
  readonly extraIndexes?: readonly (string | readonly string[])[];
}

const TABLE_INDEX_SPECS: Record<LearnerTableName, TableIndexSpec> = {
  // Composite PK (user_id, prompt_id) mirrors mobile §313's cross-user isolation guarantee.
  // `prompt_id` is also indexed alone for the promptId-only draft lookup.
  writingDrafts: {
    primaryKey: ["user_id", "prompt_id"],
    extraIndexes: ["prompt_id"],
  },
  // `next_due` mirrors mobile's `srs_cards_next_due_idx` — the due-queue query is a
  // single indexable comparison.
  srsCards: {
    primaryKey: ["id"],
    extraIndexes: ["next_due"],
  },
  // `[card_id+reviewed_at]` mirrors mobile's `srs_reviews_card_id_idx`; `card_id` alone
  // is also indexed for a plain per-card review lookup.
  srsReviews: {
    primaryKey: ["id"],
    extraIndexes: ["card_id", ["card_id", "reviewed_at"]],
  },
  contentCache: {
    primaryKey: ["cache_key"],
  },
  userStats: {
    primaryKey: ["user_id"],
  },
  // Composite PK (user_id, modelltest_slug) mirrors the server-side "one non-terminal
  // attempt per user × modelltest" rule; `user_id` is also indexed, mirroring
  // mobile's `mock_exam_cache_user_idx`.
  mockExamCache: {
    primaryKey: ["user_id", "modelltest_slug"],
    extraIndexes: ["user_id"],
  },
  cachedTopics: {
    primaryKey: ["subgenre", "level"],
  },
  // Single-slot per user — `user_id` is the PK so writes are upserts, matching
  // mobile's `INSERT … ON CONFLICT DO UPDATE`.
  activeSubmission: {
    primaryKey: ["user_id"],
  },
  // `completed_at` mirrors mobile's `drill_sessions_completed_at_idx`.
  drillSessions: {
    primaryKey: ["id"],
    extraIndexes: ["completed_at"],
  },
  // `queued_at` indexed so the outbox can be drained FIFO (oldest-queued-first retry).
  drillAttemptOutbox: {
    primaryKey: ["id"],
    extraIndexes: ["queued_at"],
  },
  // Composite PK (user_id, board, level, module_code, quiz_slug) mirrors mobile's
  // exact composite PK for the untimed practice surface. `user_id` is also
  // indexed, mirroring `mockExamCache` above, so `listPracticeProgress`'s
  // `whereEquals("user_id", ...)` (core/storage/practiceProgress.ts) can run
  // as a real Dexie `.where("user_id")` query instead of throwing DataError
  // for lack of an index.
  practiceProgress: {
    primaryKey: ["user_id", "board", "level", "module_code", "quiz_slug"],
    extraIndexes: ["user_id"],
  },
};

function keyPathToken(fields: readonly string[]): string {
  if (fields.length === 0) {
    throw new Error("keyPathToken: at least one field is required");
  }
  return fields.length === 1 ? fields[0]! : `[${fields.join("+")}]`;
}

function buildStoreSchema(spec: TableIndexSpec): string {
  const tokens = [keyPathToken(spec.primaryKey)];
  for (const index of spec.extraIndexes ?? []) {
    tokens.push(Array.isArray(index) ? keyPathToken(index) : (index as string));
  }
  return tokens.join(", ");
}

/** Dexie `.stores()` schema strings, one per table — see `TABLE_INDEX_SPECS` above. */
export const LEARNER_TABLE_SCHEMAS: Record<LearnerTableName, string> = Object.fromEntries(
  LEARNER_TABLE_NAMES.map((name) => [name, buildStoreSchema(TABLE_INDEX_SPECS[name])])
) as Record<LearnerTableName, string>;

/** Primary-key field(s) per table, in order — used by the in-memory fallback to derive keys. */
export const LEARNER_TABLE_PRIMARY_KEYS: Record<LearnerTableName, readonly string[]> =
  Object.fromEntries(
    LEARNER_TABLE_NAMES.map((name) => [name, TABLE_INDEX_SPECS[name].primaryKey])
  ) as Record<LearnerTableName, readonly string[]>;

/**
 * Constructs (but does not open) the Dexie instance. Defining the schema via
 * `.version().stores()` is synchronous and does not touch IndexedDB — it's
 * safe to call in tests without a working `indexedDB` global, as long as
 * you never call `.open()` (or an operation that triggers Dexie's implicit
 * open) on the result.
 */
export function createLearnerDexie(): Dexie {
  const db = new Dexie(LEARNER_DB_NAME);
  db.version(LEARNER_DB_VERSION).stores(LEARNER_TABLE_SCHEMAS);
  return db;
}
