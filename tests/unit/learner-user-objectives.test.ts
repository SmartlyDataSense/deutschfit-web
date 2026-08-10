/**
 * `userObjectives` — S11.2 fix-round-1 (review gap: zero coverage let a
 * broken upsert payload key AND a broken `onConflict` target stay
 * green). Mocks `getBrowserClient` the same way
 * `learner-onboarding-finish.test.ts` mocks it for
 * `persistOnboardingAnswers`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
const upsert = vi.fn();
const maybeSingle = vi.fn();
const from = vi.fn((table: string) => {
  if (table !== "user_objectives") throw new Error(`unexpected table ${table}`);
  return {
    select: () => ({ eq: () => ({ maybeSingle }) }),
    upsert,
  };
});
vi.mock("@/lib/supabase/browser", () => ({
  getBrowserClient: () => ({ auth: { getSession }, from }),
}));

import { readUserObjectives, updateUserObjectives } from "@/learner/settings/services/userObjectives";

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
  upsert.mockResolvedValue({ error: null });
  maybeSingle.mockResolvedValue({ data: { motivation: "work", daily_minutes: 20 }, error: null });
});

describe("requireUserId (S11.2 fix-round-1)", () => {
  it("readUserObjectives throws exactly 'unauthenticated' with no session", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    await expect(readUserObjectives()).rejects.toThrow(/^unauthenticated$/);
  });

  it("updateUserObjectives throws exactly 'unauthenticated' with no session", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    await expect(updateUserObjectives({ motivation: "work", schedule: "20" })).rejects.toThrow(
      /^unauthenticated$/
    );
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("updateUserObjectives upsert call (S11.2 fix-round-1)", () => {
  it("upserts the exact payload shape (user_id, motivation, daily_minutes) with onConflict: user_id", async () => {
    await updateUserObjectives({ motivation: "studies", schedule: "30" });
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith(
      { user_id: "u1", motivation: "studies", daily_minutes: 30 },
      { onConflict: "user_id" }
    );
  });

  it("a non-numeric schedule upserts daily_minutes: null", async () => {
    await updateUserObjectives({ motivation: "work", schedule: "not-a-number" });
    expect(upsert).toHaveBeenCalledWith(
      { user_id: "u1", motivation: "work", daily_minutes: null },
      { onConflict: "user_id" }
    );
  });
});

describe("PostgREST error wrapping (S11.2 fix-round-1, mobile parity)", () => {
  it("readUserObjectives wraps a PostgREST error, preferring error.message", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(readUserObjectives()).rejects.toThrow(/^boom$/);
  });

  it("readUserObjectives falls back to read_user_objectives_failed when error.message is empty", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: "" } });
    await expect(readUserObjectives()).rejects.toThrow(/^read_user_objectives_failed$/);
  });

  it("updateUserObjectives wraps a PostgREST error, preferring error.message", async () => {
    upsert.mockResolvedValue({ error: { message: "boom" } });
    await expect(updateUserObjectives({ motivation: "work", schedule: "20" })).rejects.toThrow(
      /^boom$/
    );
  });

  it("updateUserObjectives falls back to update_user_objectives_failed when error.message is empty", async () => {
    upsert.mockResolvedValue({ error: { message: "" } });
    await expect(updateUserObjectives({ motivation: "work", schedule: "20" })).rejects.toThrow(
      /^update_user_objectives_failed$/
    );
  });
});

describe("readUserObjectives happy path (S11.2 fix-round-1)", () => {
  it("returns the row mapped to camelCase", async () => {
    maybeSingle.mockResolvedValue({ data: { motivation: "work", daily_minutes: 20 }, error: null });
    await expect(readUserObjectives()).resolves.toEqual({ motivation: "work", dailyMinutes: 20 });
  });

  it("returns null when no row exists yet", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(readUserObjectives()).resolves.toBeNull();
  });
});
