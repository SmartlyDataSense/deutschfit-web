/**
 * The learner IndexedDB upgrade chain, exercised against a REAL IndexedDB
 * implementation (`fake-indexeddb`).
 *
 * ## Why this file exists
 *
 * web#44 changed `srsCards`/`srsReviews` from a single-field `id` primary
 * key to the composite `[user_id+id]`. Dexie cannot change a primary key in
 * place — declaring the new keyPath on an existing store makes `open()`
 * reject with `UpgradeError: Not yet support for changing primary key`
 * during the schema diff, BEFORE any `.upgrade()` callback runs. Because
 * `Dexie#open()` is all-or-nothing and `openLearnerDb` falls back to a
 * page-lifetime `Map` on any rejection, that single failure silently and
 * permanently disabled persistence for every table — drafts, mock-exam
 * cache, practice progress, the drill outbox — on every browser holding a
 * v1 database.
 *
 * Five reviews missed it because nothing anywhere opened a real IndexedDB:
 * `learner-db.test.ts` asserts schema *strings* under jsdom (which has no
 * `indexedDB` at all), and Playwright runs a clean browser profile per run,
 * so e2e only ever exercised the fresh-install path. This file is the pin
 * for the upgrade path specifically.
 *
 * ## The import order matters
 *
 * `fake-indexeddb/auto` must be the FIRST import: Dexie captures
 * `indexedDB`/`IDBKeyRange` from the global scope at module-evaluation
 * time, so the fake globals have to be installed before `dexie` is
 * imported (transitively, via `schema.ts`). ESM evaluates imports in source
 * order, so this side-effect import placed first is sufficient.
 */
import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Dexie from "dexie";

import {
  createLearnerDexie,
  LEARNER_DB_NAME,
  LEARNER_DB_VERSION,
  LEARNER_V1_TABLE_SCHEMAS,
} from "../../src/learner/core/db/schema";
import { getLearnerDb, __resetLearnerDbForTests } from "../../src/learner/core/db";

/**
 * Rows written into the v1 database before the upgrade. `srsCards`/
 * `srsReviews` carry NO `user_id` — that is exactly the v1 shape, and the
 * whole reason the primary key had to change. Everything else is a table
 * the upgrade must leave completely alone.
 */
const V1_SEED = {
  srsCards: [
    { id: "card-1", next_due: 1_700_000_000_000, front: "die Wohnung" },
    { id: "card-2", next_due: 1_700_000_100_000, front: "der Termin" },
  ],
  srsReviews: [{ id: "rev-1", card_id: "card-1", reviewed_at: 1_699_999_000_000, rating: 3 }],
  userStats: [{ user_id: "user-a", xp: 42 }],
  writingDrafts: [{ user_id: "user-a", prompt_id: "prompt-1", body: "Sehr geehrte Damen" }],
  drillAttemptOutbox: [{ id: "outbox-1", queued_at: 1_699_999_500_000, payload: "{}" }],
  mockExamCache: [{ user_id: "user-a", modelltest_slug: "telc-b1-mt1", state: "in_progress" }],
  practiceProgress: [
    {
      user_id: "user-a",
      board: "telc",
      level: "b1",
      module_code: "lesen",
      quiz_slug: "quiz-1",
      score: 7,
    },
  ],
} as const;

/** Opens a database at the frozen v1 schema and writes `V1_SEED` into it. */
async function seedV1Database(): Promise<void> {
  const v1 = new Dexie(LEARNER_DB_NAME);
  v1.version(1).stores(LEARNER_V1_TABLE_SCHEMAS);
  await v1.open();
  expect(v1.verno).toBe(1);
  for (const [table, rows] of Object.entries(V1_SEED)) {
    await v1.table(table).bulkPut(rows as unknown as readonly object[]);
  }
  v1.close();
}

beforeEach(async () => {
  await Dexie.delete(LEARNER_DB_NAME);
});

afterEach(async () => {
  await Dexie.delete(LEARNER_DB_NAME);
});

describe("learner db — v1 → v3 upgrade chain (web#44 primary-key change)", () => {
  it("opens cleanly from an existing v1 database instead of throwing UpgradeError", async () => {
    await seedV1Database();

    const db = createLearnerDexie();
    // The regression this pins: an in-place PK change rejects here with
    // "Not yet support for changing primary key", and `openLearnerDb`
    // converts that into a silent, permanent, whole-database outage.
    await db.open();

    expect(db.verno).toBe(LEARNER_DB_VERSION);
    expect(db.verno).toBe(3);
    db.close();
  });

  it("recreates srsCards/srsReviews empty, with the composite [user_id+id] primary key", async () => {
    await seedV1Database();

    const db = createLearnerDexie();
    await db.open();

    expect(await db.table("srsCards").count()).toBe(0);
    expect(await db.table("srsReviews").count()).toBe(0);
    expect(db.table("srsCards").schema.primKey.keyPath).toEqual(["user_id", "id"]);
    expect(db.table("srsReviews").schema.primKey.keyPath).toEqual(["user_id", "id"]);
    db.close();
  });

  it("preserves every other table's rows across the upgrade", async () => {
    await seedV1Database();

    const db = createLearnerDexie();
    await db.open();

    expect(await db.table("userStats").toArray()).toEqual([{ user_id: "user-a", xp: 42 }]);
    expect(await db.table("writingDrafts").toArray()).toEqual([
      { user_id: "user-a", prompt_id: "prompt-1", body: "Sehr geehrte Damen" },
    ]);
    expect(await db.table("drillAttemptOutbox").toArray()).toEqual([
      { id: "outbox-1", queued_at: 1_699_999_500_000, payload: "{}" },
    ]);
    expect(await db.table("mockExamCache").count()).toBe(1);
    expect(await db.table("practiceProgress").count()).toBe(1);
    db.close();
  });

  it("leaves scoped where('user_id') queries working on the recreated SRS tables", async () => {
    await seedV1Database();

    const db = createLearnerDexie();
    await db.open();

    await db.table("srsCards").bulkPut([
      { user_id: "user-a", id: "card-1", next_due: 1, front: "mine" },
      { user_id: "user-b", id: "card-1", next_due: 2, front: "theirs" },
    ]);

    // Per-account isolation — the entire point of web#44. Same `id`, two
    // accounts, two distinct rows, and the scoped query sees only one.
    const mine = await db.table("srsCards").where("user_id").equals("user-a").toArray();
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ user_id: "user-a", front: "mine" });
    expect(await db.table("srsCards").count()).toBe(2);

    const reviewsScoped = await db.table("srsReviews").where("user_id").equals("user-a").toArray();
    expect(reviewsScoped).toEqual([]);
    db.close();
  });

  it("opens cleanly on a fresh install, walking the whole 1 → 3 chain in one open()", async () => {
    // No seeding: an empty origin still has to traverse every declared
    // version block, including the v2 drop of stores that never existed.
    const db = createLearnerDexie();
    await db.open();

    expect(db.verno).toBe(3);
    expect(await db.table("srsCards").count()).toBe(0);
    expect(db.table("srsCards").schema.primKey.keyPath).toEqual(["user_id", "id"]);
    db.close();
  });

  it("is idempotent — reopening an already-migrated v3 database is a no-op", async () => {
    await seedV1Database();

    const first = createLearnerDexie();
    await first.open();
    await first.table("srsCards").put({ user_id: "user-a", id: "card-9", next_due: 5 });
    first.close();

    const second = createLearnerDexie();
    await second.open();
    expect(second.verno).toBe(3);
    expect(await second.table("srsCards").count()).toBe(1);
    expect(await second.table("userStats").count()).toBe(1);
    second.close();
  });
});

describe("learner db — an unopenable database degrades loudly, not silently", () => {
  afterEach(() => {
    __resetLearnerDbForTests();
  });

  it("logs the open failure before falling back to the non-persistent in-memory store", async () => {
    // An on-disk v1 database whose `contentCache` carries a primary key the
    // current schema does not declare. Upgrading to v3 therefore hits the
    // same in-place primary-key change Dexie refuses — i.e. this reproduces
    // C1's failure mode generically, on a table C1 never touched, so the
    // pin survives the C1 fix. Any open rejection reaches the same `catch`,
    // which used to be bare: a schema defect was indistinguishable from
    // private-mode Safari, so C1 disabled all persistence in silence.
    const corrupt = new Dexie(LEARNER_DB_NAME);
    corrupt.version(1).stores({ ...LEARNER_V1_TABLE_SCHEMAS, contentCache: "some_other_key" });
    await corrupt.open();
    corrupt.close();

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    __resetLearnerDbForTests();

    const handle = await getLearnerDb();

    // The fallback itself is correct and must stay — private-mode Safari
    // genuinely needs it.
    expect(handle.isPersistent).toBe(false);
    // But it must not be silent.
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain("[learner-db]");
    // The bound error has to actually be passed through, not swallowed.
    expect(warn.mock.calls[0]?.[1]).toBeInstanceOf(Error);

    warn.mockRestore();
  });
});

describe("learner db — the frozen v1 declaration", () => {
  it("keeps the single-field `id` primary key that actually shipped as v1", () => {
    // If someone re-derives this block from LEARNER_TABLE_SCHEMAS, these
    // two flip to the composite form and Dexie starts diffing real on-disk
    // v1 databases against a schema that never existed on any device.
    expect(LEARNER_V1_TABLE_SCHEMAS.srsCards).toBe("id, next_due");
    expect(LEARNER_V1_TABLE_SCHEMAS.srsReviews).toBe("id, card_id, [card_id+reviewed_at]");
  });

  it("declares all 11 tables, so a v1 database on disk diffs against the full historical set", () => {
    expect(Object.keys(LEARNER_V1_TABLE_SCHEMAS)).toHaveLength(11);
  });
});
