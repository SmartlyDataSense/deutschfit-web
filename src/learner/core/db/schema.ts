/**
 * Dexie schema for the learner IndexedDB (`deutschfit-learner`, v3).
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
export const LEARNER_DB_VERSION = 3;

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
  // Composite PK (user_id, id) — schema v3 (web#44): in v1 this was `id`
  // alone, which let a browser-shared account inherit the previous
  // account's deck the moment a card producer started writing rows. `id`
  // alone was never queryable as an index on its own before either — it's
  // still reachable as the first key-path segment of the compound PK.
  // The store is dropped at v2 and recreated here at v3 — see
  // `createLearnerDexie` below for why an in-place PK change is impossible.
  // `user_id` is also indexed alone (mirrors `mockExamCache`/
  // `practiceProgress` below) so `queryDueCards` can run a real Dexie
  // `.where("user_id")` scoped query instead of a full-table scan.
  // `next_due` mirrors mobile's `srs_cards_next_due_idx`.
  srsCards: {
    primaryKey: ["user_id", "id"],
    extraIndexes: ["user_id", "next_due"],
  },
  // Composite PK (user_id, id) — same v3 rationale as `srsCards` above.
  // `user_id` is indexed alone for the scoped due-queue/review lookups;
  // `[card_id+reviewed_at]` mirrors mobile's `srs_reviews_card_id_idx`;
  // `card_id` alone is also indexed for a plain per-card review lookup.
  srsReviews: {
    primaryKey: ["user_id", "id"],
    extraIndexes: ["user_id", "card_id", ["card_id", "reviewed_at"]],
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
 * FROZEN HISTORY — the exact `.stores()` strings that shipped as schema
 * version 1 (S0 through S13, base `5d5621d`). Verified byte-for-byte
 * against `git show 5d5621d:src/learner/core/db/schema.ts`.
 *
 * These are literals ON PURPOSE and must NEVER be edited, re-derived, or
 * spread from `LEARNER_TABLE_SCHEMAS`. Dexie diffs a real on-disk v1
 * database against this declaration; if a future table edit silently
 * rewrote it, Dexie would compare against a schema that never existed on
 * any device and either mis-migrate or refuse to open. Adding an index to
 * any table means adding a NEW `.version()` block below and bumping
 * `LEARNER_DB_VERSION` — never touching this constant.
 *
 * Only browsers that already hold a v1 database on disk ever traverse it;
 * a fresh browser still walks the whole 1 → 3 chain in one `open()`, so it
 * has to stay declarable regardless.
 */
const LEARNER_V1_TABLE_SCHEMAS: Record<LearnerTableName, string> = {
  writingDrafts: "[user_id+prompt_id], prompt_id",
  srsCards: "id, next_due",
  srsReviews: "id, card_id, [card_id+reviewed_at]",
  contentCache: "cache_key",
  userStats: "user_id",
  mockExamCache: "[user_id+modelltest_slug], user_id",
  cachedTopics: "[subgenre+level]",
  activeSubmission: "user_id",
  drillSessions: "id, completed_at",
  drillAttemptOutbox: "id, queued_at",
  practiceProgress: "[user_id+board+level+module_code+quiz_slug], user_id",
};

/** Exported for `tests/unit/learner-db-migration.test.ts`, which seeds a real v1 database. */
export { LEARNER_V1_TABLE_SCHEMAS };

/**
 * Constructs (but does not open) the Dexie instance. Defining the schema via
 * `.version().stores()` is synchronous and does not touch IndexedDB — it's
 * safe to call in tests without a working `indexedDB` global, as long as
 * you never call `.open()` (or an operation that triggers Dexie's implicit
 * open) on the result.
 *
 * ## Why the SRS tables are dropped at v2 and recreated at v3
 *
 * web#44 moves `srsCards`/`srsReviews` to a `(user_id, id)` composite
 * primary key for per-account deck isolation, following the same shape
 * `writingDrafts`/`mockExamCache`/`practiceProgress` already use (see
 * `TABLE_INDEX_SPECS` above).
 *
 * **Dexie cannot change a primary key in place.** Declaring the new
 * keyPath on an existing store makes `open()` reject at schema-diff time
 * with `UpgradeError: Not yet support for changing primary key` — BEFORE
 * any `.upgrade()` callback runs, so no content-migration hook can rescue
 * it. This was reproduced against `dexie@4.4.4` + `fake-indexeddb`, and
 * it fails identically whether `srsCards` holds rows or is completely
 * empty: it is a store-definition rejection, not a data migration, so row
 * count is irrelevant. `Dexie#open()` is all-or-nothing, so that single
 * rejection would take down persistence for EVERY table — drafts, the
 * mock-exam cache, practice progress, the drill outbox — permanently, for
 * every browser holding a v1 database.
 *
 * The only supported way to change a PK is to drop the store in one
 * version and recreate it in the next, which is what happens below:
 *
 *   - `version(2)` passes `null` for the two SRS tables, deleting them.
 *     `.stores()` is a delta against the previous version, so every other
 *     table is untouched and keeps its rows.
 *   - `version(3)` declares the full current table set, recreating
 *     `srsCards`/`srsReviews` empty with the `[user_id+id]` primary key.
 *
 * Losing the pre-v2 SRS rows is acceptable — but note the reason is NOT
 * "no card producer has shipped, so there is nothing on disk to lose"
 * (that argument is void: an empty store fails the in-place change just as
 * hard). The reason is that every SRS row is 100% locally-derived and
 * re-derivable from server content, so dropping the store costs nothing
 * beyond a re-derivation. Do NOT copy this drop-and-recreate shape for a
 * table whose rows are the only copy.
 *
 * `version(3)` is the live block: it is spread from `LEARNER_TABLE_SCHEMAS`
 * deliberately, because it describes the CURRENT schema. Any future table
 * change needs its own `version(4)` block plus a `LEARNER_DB_VERSION`
 * bump — editing `version(3)` in place would break every browser that has
 * already opened at 3.
 */
export function createLearnerDexie(): Dexie {
  const db = new Dexie(LEARNER_DB_NAME);
  db.version(1).stores(LEARNER_V1_TABLE_SCHEMAS);
  // Drop-half of the web#44 primary-key change. Frozen history from here on.
  db.version(2).stores({ srsCards: null, srsReviews: null });
  // Recreate-half — the live current schema.
  db.version(LEARNER_DB_VERSION).stores(LEARNER_TABLE_SCHEMAS);
  return db;
}
