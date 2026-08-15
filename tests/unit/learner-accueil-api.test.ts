import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeFn = vi.fn();
vi.mock("@/learner/core/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/core/api/client")>();
  return { ...actual, invokeFn: (...a: unknown[]) => invokeFn(...a) };
});
const eq = vi.fn(async () => ({ error: null }));
const update = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ update }));
vi.mock("@/lib/supabase/browser", () => ({ getBrowserClient: () => ({ from }) }));
vi.mock("@/learner/core/auth/useLearnerSession", () => ({
  useLearnerSession: { getState: () => ({ session: { user: { id: "u1" } } }) },
}));

import { fetchAccueilHome, updateExamDate } from "@/learner/accueil/api";
import { fetchHistory } from "@/learner/core/api/history";
import { fetchDailyDrill } from "@/learner/core/api/dailyDrill";

const homePayload = {
  currentLevel: "b1",
  targetLevel: "b1",
  countdown: {
    daysRemaining: 42,
    examDateLabel: "17 juin 2026",
    preparationPct: 50,
    targetScore: 80,
  },
  priorityTask: {
    skill: "",
    title: "",
    level: "",
    teil: "",
    body: "",
    durationMinutes: 0,
    pointsDelta: 0,
    attempts: 0,
    bestScore: 0,
  },
  todayStats: { taskCount: 0, minutes: 0 },
};

describe("S3 wire clients", () => {
  beforeEach(() => {
    invokeFn.mockReset();
    from.mockClear();
    update.mockClear();
    eq.mockClear();
  });

  it("fetchAccueilHome GETs accueil-home and validates the payload", async () => {
    invokeFn.mockResolvedValue(homePayload);
    await expect(fetchAccueilHome()).resolves.toEqual(homePayload);
    expect(invokeFn).toHaveBeenCalledWith("accueil-home", { method: "GET" });
    invokeFn.mockResolvedValue({ nope: true });
    await expect(fetchAccueilHome()).rejects.toThrow("accueil_home_malformed_response");
  });

  it("countdown accepts nulls for daysRemaining/examDateLabel (no-date branch)", async () => {
    invokeFn.mockResolvedValue({
      ...homePayload,
      countdown: { daysRemaining: null, examDateLabel: null, preparationPct: 0, targetScore: 80 },
    });
    const p = await fetchAccueilHome();
    expect(p.countdown.daysRemaining).toBeNull();
  });

  it("updateExamDate updates the caller's user_profiles row", async () => {
    await updateExamDate("2026-09-01");
    expect(from).toHaveBeenCalledWith("user_profiles");
    expect(update).toHaveBeenCalledWith({ exam_date: "2026-09-01" });
    expect(eq).toHaveBeenCalledWith("user_id", "u1");
  });

  it("fetchHistory POSTs cursor/limit and coerces legacy rows (status/board/title → null/'' defaults)", async () => {
    invokeFn.mockResolvedValue({
      pinnedDiagnostic: null,
      feed: [
        {
          id: "r1",
          kind: "schreiben",
          createdAt: "2026-08-01T10:00:00Z",
          score: 18,
          scoreMax: 24,
          level: "b1.2",
          deepLinkRoute: { screen: "Feedback", params: { runId: "r1" } },
        },
      ],
      nextCursor: "abc",
    });
    const page = await fetchHistory({ cursor: "prev", limit: 20 });
    expect(invokeFn).toHaveBeenCalledWith("history-get", {
      method: "POST",
      body: { cursor: "prev", limit: 20 },
    });
    expect(page.feed[0]).toMatchObject({
      status: null,
      errorMessage: null,
      board: "",
      title: null,
    });
    expect(page.nextCursor).toBe("abc");
  });

  it("fetchDailyDrill maps items→count and collapses failures to reason:'error'", async () => {
    invokeFn.mockResolvedValue({ items: [1, 2, 3], reason: "ok" });
    await expect(fetchDailyDrill(5)).resolves.toEqual({ itemCount: 3, reason: "ok" });
    expect(invokeFn).toHaveBeenCalledWith("drill-recommend", {
      method: "POST",
      body: { surface: "home_daily", max_items: 5 },
    });
    invokeFn.mockRejectedValue(new Error("net"));
    await expect(fetchDailyDrill()).resolves.toEqual({ itemCount: 0, reason: "error" });
  });
});
