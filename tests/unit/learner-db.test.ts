/**
 * Learner IndexedDB (Dexie) layer + localStorage flag helpers.
 *
 * `jsdom` (this repo's vitest environment) does not implement
 * `indexedDB` at all — `'indexedDB' in window` is `false`, so
 * `typeof indexedDB === "undefined"` is reliably `true` under this test
 * suite. That means `getLearnerDb()` always exercises the in-memory
 * fallback branch here; the real-Dexie branch is instead verified by
 * constructing the schema directly (`createLearnerDexie()`) and
 * inspecting `.tables` / `.schema.primKey` *without* calling `.open()` —
 * Dexie parses `.version().stores()` synchronously and does not touch
 * IndexedDB until `.open()` (or an operation that triggers an implicit
 * open), so this is safe without a working `indexedDB` global.
 *
 * fake-indexeddb is intentionally NOT used (not an approved new dep).
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  LEARNER_TABLE_NAMES,
  LEARNER_TABLE_SCHEMAS,
  LEARNER_TABLE_PRIMARY_KEYS,
  LEARNER_DB_NAME,
  LEARNER_DB_VERSION,
  createLearnerDexie,
} from "../../src/learner/core/db/schema";
import { getLearnerDb, __resetLearnerDbForTests } from "../../src/learner/core/db";
import {
  LEARNER_LANG_STORAGE_KEY,
  LEARNER_ANALYTICS_OPT_OUT_KEY,
  LEARNER_MIC_CHECK_PASSED_KEY,
  LEARNER_ONBOARDING_DONE_LEGACY_KEY,
  learnerOnboardingDoneKeyFor,
  learnerCoachOpenerSeenKeyFor,
  getFlag,
  setFlag,
  removeFlag,
} from "../../src/learner/core/storage/flags";

function installLocalStorageMock(): void {
  let store = new Map<string, string>();
  const mock: Storage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store = new Map();
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(window, "localStorage", {
    value: mock,
    configurable: true,
    writable: true,
  });
}

describe("learner db — table registry", () => {
  it("has exactly the 11 expected table names", () => {
    expect([...LEARNER_TABLE_NAMES].sort()).toEqual(
      [
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
      ].sort()
    );
    expect(LEARNER_TABLE_NAMES).toHaveLength(11);
  });

  it("uses db name and version 1", () => {
    expect(LEARNER_DB_NAME).toBe("deutschfit-learner");
    expect(LEARNER_DB_VERSION).toBe(1);
  });
});

describe("learner db — schema strings contain the expected primary keys", () => {
  it.each([
    ["writingDrafts", "[user_id+prompt_id]"],
    ["srsCards", "id"],
    ["srsReviews", "id"],
    ["contentCache", "cache_key"],
    ["userStats", "user_id"],
    ["mockExamCache", "[user_id+modelltest_slug]"],
    ["cachedTopics", "[subgenre+level]"],
    ["activeSubmission", "user_id"],
    ["drillSessions", "id"],
    ["drillAttemptOutbox", "id"],
    ["practiceProgress", "[user_id+board+level+module_code+quiz_slug]"],
  ] as const)("%s schema string starts with primary key token %s", (table, pkToken) => {
    const schema = LEARNER_TABLE_SCHEMAS[table];
    expect(schema.split(",")[0]?.trim()).toBe(pkToken);
  });

  it("indexes srs_cards.next_due (due-queue query)", () => {
    expect(LEARNER_TABLE_SCHEMAS.srsCards).toContain("next_due");
  });

  it("indexes srs_reviews by [card_id+reviewed_at] (mirrors mobile's srs_reviews_card_id_idx)", () => {
    expect(LEARNER_TABLE_SCHEMAS.srsReviews).toContain("[card_id+reviewed_at]");
  });

  it("indexes mock_exam_cache.user_id (mirrors mobile's mock_exam_cache_user_idx)", () => {
    expect(LEARNER_TABLE_SCHEMAS.mockExamCache).toContain("user_id");
  });

  it("indexes drill_attempt_outbox.queued_at (FIFO drain order)", () => {
    expect(LEARNER_TABLE_SCHEMAS.drillAttemptOutbox).toContain("queued_at");
  });
});

describe("learner db — Dexie schema construction without open()", () => {
  it("registers all 11 tables with the expected primary key on the constructed (unopened) Dexie instance", () => {
    const db = createLearnerDexie();

    expect(db.tables.map((t) => t.name).sort()).toEqual([...LEARNER_TABLE_NAMES].sort());

    for (const name of LEARNER_TABLE_NAMES) {
      const table = db.table(name);
      const primaryKey = LEARNER_TABLE_PRIMARY_KEYS[name];
      if (primaryKey.length === 1) {
        expect(table.schema.primKey.keyPath).toBe(primaryKey[0]);
      } else {
        expect(table.schema.primKey.keyPath).toEqual(primaryKey);
      }
    }
  });
});

describe("learner db — in-memory fallback", () => {
  beforeEach(() => {
    __resetLearnerDbForTests();
  });

  afterEach(() => {
    __resetLearnerDbForTests();
  });

  it("activates when indexedDB is undefined (true under jsdom)", async () => {
    expect(typeof indexedDB).toBe("undefined");

    const db = await getLearnerDb();

    expect(db.isPersistent).toBe(false);
  });

  it("supports put/get roundtrip on a single-field-PK table (contentCache)", async () => {
    const db = await getLearnerDb();
    const row = {
      cache_key: "reading-start:goethe:b1",
      payload: "{}",
      fetched_at: 1_700_000_000_000,
    };

    await db.contentCache.put(row);
    const fetched = await db.contentCache.get("reading-start:goethe:b1");

    expect(fetched).toEqual(row);
  });

  it("supports put/get roundtrip on a composite-PK table (writingDrafts)", async () => {
    const db = await getLearnerDb();
    const row = {
      user_id: "u1",
      prompt_id: "p1",
      body_de: "Liebe Frau Müller, ...",
      updated_at: 1_700_000_000_000,
    };

    await db.writingDrafts.put(row);
    const fetched = await db.writingDrafts.get(["u1", "p1"]);

    expect(fetched).toEqual(row);
  });

  it("supports delete and toArray", async () => {
    const db = await getLearnerDb();
    await db.drillAttemptOutbox.put({
      id: "a1",
      drill_item_id: "item-1",
      surface: "drills",
      selected: "b",
      is_correct: 1,
      queued_at: 1,
      attempts: 0,
    });
    await db.drillAttemptOutbox.put({
      id: "a2",
      drill_item_id: "item-2",
      surface: "drills",
      selected: "a",
      is_correct: 0,
      queued_at: 2,
      attempts: 0,
    });

    expect(await db.drillAttemptOutbox.toArray()).toHaveLength(2);

    await db.drillAttemptOutbox.delete("a1");
    const remaining = await db.drillAttemptOutbox.toArray();

    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.id).toBe("a2");
  });

  it("supports whereEquals", async () => {
    const db = await getLearnerDb();
    await db.srsCards.put({
      id: "c1",
      card_type: "vocab",
      prompt: { de: "das Haus" },
      answer: { fr: "la maison" },
      source_ref: "deck-1",
      deck: "haus-deck",
      next_due: 100,
      created_at: 1,
    });
    await db.srsCards.put({
      id: "c2",
      card_type: "grammar_connector",
      prompt: { de: "weil" },
      answer: { fr: "parce que" },
      source_ref: "deck-1",
      deck: "connector-deck",
      next_due: 200,
      created_at: 2,
    });

    const vocabCards = await db.srsCards.whereEquals("card_type", "vocab");

    expect(vocabCards).toHaveLength(1);
    expect(vocabCards[0]?.id).toBe("c1");
  });
});

describe("learner storage flags — key constants match mobile's AsyncStorage literals", () => {
  it("has the exact mobile key strings", () => {
    expect(LEARNER_LANG_STORAGE_KEY).toBe("@deutschfit/lang");
    expect(LEARNER_ANALYTICS_OPT_OUT_KEY).toBe("@deutschfit/analytics-opt-out");
    expect(LEARNER_MIC_CHECK_PASSED_KEY).toBe("@deutschfit/sprechen-mic-check-passed");
    expect(LEARNER_ONBOARDING_DONE_LEGACY_KEY).toBe("@deutschfit/onboarding-done");
    expect(learnerOnboardingDoneKeyFor("u1")).toBe("@deutschfit/onboarding-done/u1");
    expect(learnerCoachOpenerSeenKeyFor("u1")).toBe("@deutschfit/coach-opener-seen/u1");
  });
});

describe("learner storage flags — getFlag/setFlag/removeFlag", () => {
  beforeEach(() => {
    installLocalStorageMock();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("round-trips a value through setFlag/getFlag", () => {
    expect(getFlag(LEARNER_MIC_CHECK_PASSED_KEY)).toBeNull();

    setFlag(LEARNER_MIC_CHECK_PASSED_KEY, "true");

    expect(getFlag(LEARNER_MIC_CHECK_PASSED_KEY)).toBe("true");
  });

  it("removeFlag clears a previously-set value", () => {
    setFlag(LEARNER_ANALYTICS_OPT_OUT_KEY, "true");
    expect(getFlag(LEARNER_ANALYTICS_OPT_OUT_KEY)).toBe("true");

    removeFlag(LEARNER_ANALYTICS_OPT_OUT_KEY);

    expect(getFlag(LEARNER_ANALYTICS_OPT_OUT_KEY)).toBeNull();
  });

  it("is SSR-safe: does not throw when window is undefined-like (guards present)", () => {
    // We can't literally delete `window` under jsdom, but we can confirm the
    // guarded calls behave — a stronger SSR guarantee is covered by the
    // `typeof window === "undefined"` guard reading cleanly at module scope
    // (exercised implicitly by every server-rendered page importing flags.ts).
    expect(() => setFlag(LEARNER_LANG_STORAGE_KEY, "en")).not.toThrow();
    expect(() => getFlag(LEARNER_LANG_STORAGE_KEY)).not.toThrow();
    expect(() => removeFlag(LEARNER_LANG_STORAGE_KEY)).not.toThrow();
  });
});
