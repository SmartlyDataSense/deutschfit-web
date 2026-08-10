import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeFn = vi.fn();
vi.mock("@/learner/core/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/core/api/client")>();
  return { ...actual, invokeFn: (...a: unknown[]) => invokeFn(...a) };
});

import { fetchUserStats } from "@/learner/profil/api";
import { emptyProfilStats } from "@/learner/profil/data/fixtures";
import {
  commitToCache,
  hydrateFromCache,
  rowToStats,
} from "@/learner/profil/hooks/useProfilStats";
import { getLearnerDb, __resetLearnerDbForTests } from "@/learner/core/db";
import type { UserStatsRow } from "@/learner/core/db/types";

const payload = {
  fullName: "Marie Dupont",
  location: "Douala",
  languages: ["Français", "Anglais"],
  examLabel: "B1",
  daysRemaining: 42,
  reminderTime: "",
  offlineLessonsCount: 0,
  offlineSizeMb: 0,
  dataSaverOn: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  __resetLearnerDbForTests();
});

describe("fetchUserStats (S11.2)", () => {
  it("GETs the user-stats edge function and returns the validated payload", async () => {
    invokeFn.mockResolvedValue(payload);
    const result = await fetchUserStats();
    expect(invokeFn).toHaveBeenCalledWith("user-stats", { method: "GET" });
    expect(result.fullName).toBe("Marie Dupont");
    expect(result.languages).toEqual(["Français", "Anglais"]);
  });

  it("maps a transport failure to user_stats_transport_error", async () => {
    invokeFn.mockRejectedValue(new Error("boom"));
    await expect(fetchUserStats()).rejects.toThrow("user_stats_transport_error");
  });

  it("rejects an empty response", async () => {
    invokeFn.mockResolvedValue(null);
    await expect(fetchUserStats()).rejects.toThrow("user_stats_empty_response");
  });

  it("rejects a malformed response (fullName not a string)", async () => {
    invokeFn.mockResolvedValue({ ...payload, fullName: 7 });
    await expect(fetchUserStats()).rejects.toThrow("user_stats_malformed_response");
  });
});

describe("useProfilStats cache helpers (S11.2)", () => {
  it("rowToStats keeps the PREVIOUS languages on a corrupt blob (mobile parity)", () => {
    const row = {
      user_id: "u1",
      full_name: "Marie",
      location: "Douala",
      languages: "{not json",
      exam_label: "B1",
      days_remaining: 10,
      reminder_time: "",
      offline_lessons_count: 0,
      offline_size_mb: 0,
      data_saver_on: 0,
      updated_at: 123,
    } as UserStatsRow;
    const previous = { ...emptyProfilStats, languages: ["Français"] };
    const stats = rowToStats(row, previous);
    // Mobile's guard (useProfilStats.ts:72,79) preserves previous.languages
    // on corrupt JSON — it does NOT reset to [].
    expect(stats.languages).toEqual(["Français"]);
    expect(stats.fullName).toBe("Marie");
    // And with no meaningful previous, the fallback is the empty default.
    expect(rowToStats(row, emptyProfilStats).languages).toEqual([]);
  });

  it("commitToCache then hydrateFromCache round-trips", async () => {
    await commitToCache("u1", payload, 1_000);
    const hydrated = await hydrateFromCache("u1");
    expect(hydrated).not.toBeNull();
    expect(hydrated!.stats.fullName).toBe("Marie Dupont");
    expect(hydrated!.stats.languages).toEqual(["Français", "Anglais"]);
    expect(hydrated!.updatedAt).toBe(1_000);
    const db = await getLearnerDb();
    const raw = (await db.userStats.get("u1")) as UserStatsRow | undefined;
    expect(typeof raw?.languages).toBe("string"); // stored as JSON string, mobile row parity
  });

  it("hydrateFromCache returns null for an unknown user", async () => {
    expect(await hydrateFromCache("nobody")).toBeNull();
  });
});

describe("emptyProfilStats (S11.2)", () => {
  it("is all-empty defaults (degamified profil renders from it safely)", () => {
    expect(emptyProfilStats.fullName).toBe("");
    expect(emptyProfilStats.languages).toEqual([]);
    expect(emptyProfilStats.daysRemaining).toBe(0);
  });
});
