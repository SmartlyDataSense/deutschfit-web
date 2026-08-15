import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getBetaLevels, isLevelInBeta } from "@/learner/core/flags/betaLevels";
import { getBackendInfo, readProjectRef } from "@/learner/core/api/backendEnv";
import { getLearnerDb, __resetLearnerDbForTests } from "@/learner/core/db";
import { wipeLocalState } from "@/learner/core/storage/wipe";
import { EXAM_CONTEXT_STORAGE_KEY } from "@/learner/core/exam/examContext";
import {
  LEARNER_LANG_STORAGE_KEY,
  LEARNER_ONBOARDING_DONE_LEGACY_KEY,
  learnerOnboardingDoneKeyFor,
  setFlag,
  getFlag,
} from "@/learner/core/storage/flags";

// jsdom localStorage is unreliable in this repo (flags.ts docstring) —
// install a minimal in-memory Storage mock.
function installStorageMock(): void {
  const store = new Map<string, string>();
  const mock = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(window, "localStorage", { value: mock, configurable: true });
}

describe("betaLevels (S11.1)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to b1,b2 when the env var is unset", () => {
    vi.stubEnv("NEXT_PUBLIC_BETA_LEVELS_ENABLED", undefined); // Vitest ≥2.1: undefined deletes the var
    expect(getBetaLevels()).toEqual(["b1", "b2"]);
    expect(isLevelInBeta("b1")).toBe(true);
    expect(isLevelInBeta("c1")).toBe(false);
  });

  it("empty string means no beta levels (explicit opt-out, not default)", () => {
    vi.stubEnv("NEXT_PUBLIC_BETA_LEVELS_ENABLED", "");
    expect(getBetaLevels()).toEqual([]);
  });

  it("parses, trims, lowercases and drops invalid tokens", () => {
    vi.stubEnv("NEXT_PUBLIC_BETA_LEVELS_ENABLED", " B1 , c1, nope ,");
    expect(getBetaLevels()).toEqual(["b1", "c1"]);
  });
});

describe("backendEnv (S11.1)", () => {
  it("extracts the project ref from a supabase url", () => {
    expect(readProjectRef("https://ocqoqnifzlkrgcyjljpl.supabase.co")).toBe("ocqoqnifzlkrgcyjljpl");
    expect(readProjectRef("https://example.com")).toBeNull();
    expect(readProjectRef(undefined)).toBeNull();
  });

  it("trims whitespace before matching (mobile parity — backendEnv.ts:34)", () => {
    expect(readProjectRef("  https://ocqoqnifzlkrgcyjljpl.supabase.co  ")).toBe(
      "ocqoqnifzlkrgcyjljpl"
    );
  });

  it("maps known refs to env names, unknown to 'unknown'", () => {
    expect(getBackendInfo("https://ocqoqnifzlkrgcyjljpl.supabase.co").env).toBe("dev");
    expect(getBackendInfo("https://auketecsgmdqlexosaay.supabase.co").env).toBe("prod");
    expect(getBackendInfo("https://zzzzzzzzzzzzzzzzzzzz.supabase.co").env).toBe("unknown");
  });
});

describe("db clear() + wipeLocalState (S11.1)", () => {
  beforeEach(() => {
    installStorageMock();
    __resetLearnerDbForTests();
  });

  it("clear() empties a table (in-memory fallback)", async () => {
    const db = await getLearnerDb();
    await db.userStats.put({ user_id: "u1", full_name: "Marie" });
    expect(await db.userStats.toArray()).toHaveLength(1);
    await db.userStats.clear();
    expect(await db.userStats.toArray()).toHaveLength(0);
  });

  it("wipeLocalState clears every table and the user-scoped keys, keeps the lang key", async () => {
    const db = await getLearnerDb();
    await db.userStats.put({ user_id: "u1", full_name: "Marie" });
    await db.srsCards.put({ id: "c1", next_due: 0 });
    await db.drillAttemptOutbox.put({ id: "o1", queued_at: 1 });
    setFlag(
      EXAM_CONTEXT_STORAGE_KEY,
      JSON.stringify({ board: "telc", level: "b1", source: "settings" })
    );
    setFlag(LEARNER_ONBOARDING_DONE_LEGACY_KEY, "true");
    setFlag(learnerOnboardingDoneKeyFor("u1"), "true");
    setFlag(LEARNER_LANG_STORAGE_KEY, "fr");

    await wipeLocalState("u1");

    expect(await db.userStats.toArray()).toHaveLength(0);
    expect(await db.srsCards.toArray()).toHaveLength(0);
    expect(await db.drillAttemptOutbox.toArray()).toHaveLength(0);
    expect(getFlag(EXAM_CONTEXT_STORAGE_KEY)).toBeNull();
    expect(getFlag(LEARNER_ONBOARDING_DONE_LEGACY_KEY)).toBeNull();
    expect(getFlag(learnerOnboardingDoneKeyFor("u1"))).toBeNull();
    // Language survives deletion — mobile parity (mobile/src/core/storage/wipe.ts).
    expect(getFlag(LEARNER_LANG_STORAGE_KEY)).toBe("fr");
  });
});
