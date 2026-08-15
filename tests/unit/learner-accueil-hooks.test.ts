import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/learner/core/auth/useLearnerSession", () => ({
  useLearnerSession: { getState: () => ({ session: null }) },
}));

import {
  __resetReadinessForTest,
  __setUserIdResolverForTest,
  markCorrectionReady,
  markSubmissionInFlight,
} from "@/learner/core/readiness";
import { useAccueilHome } from "@/learner/accueil/hooks/useAccueilHome";
import { useDailyDrill } from "@/learner/accueil/hooks/useDailyDrill";
import { useHeroState } from "@/learner/accueil/hooks/useHeroState";
import { useHistory } from "@/learner/accueil/hooks/useHistory";
import { useReadinessSignal } from "@/learner/accueil/hooks/useReadinessSignal";
import type { AccueilHomePayload } from "@/learner/accueil/api";
import type { HistoryPayload } from "@/learner/core/api/history";

const home: AccueilHomePayload = {
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
const page = (rows: string[], next: string | null): HistoryPayload => ({
  pinnedDiagnostic: null,
  feed: rows.map((id) => ({
    id,
    kind: "schreiben" as const,
    createdAt: "2026-08-01T10:00:00Z",
    score: 1,
    scoreMax: 2,
    level: "b1",
    board: "",
    title: null,
    status: null,
    errorMessage: null,
    deepLinkRoute: { screen: "Feedback", params: { runId: id } },
  })),
  nextCursor: next,
});

beforeEach(() => {
  __resetReadinessForTest();
  __setUserIdResolverForTest(() => null);
});

// `vitest.config.ts` sets `globals: false`, so RTL's automatic
// cleanup-after-each cannot self-register (it needs a global `afterEach`
// to hook into) — every file that calls `render`/`renderHook` must
// explicitly unmount here, or hook instances (and their store
// subscriptions) leak across tests.
afterEach(() => {
  cleanup();
});

describe("useAccueilHome", () => {
  it("loads once, keeps the cache on failed refetch, flips isError only with no cache", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(home).mockRejectedValueOnce(new Error("net"));
    const { result } = renderHook(() => useAccueilHome({ deps: { fetchAccueilHome: fetcher } }));
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.data).toEqual(home));
    await act(() => result.current.refetch());
    expect(result.current.data).toEqual(home); // cache-keep
    expect(result.current.isError).toBe(false);
  });
  it("hard-errors when the initial fetch fails with no cache", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("net"));
    const { result } = renderHook(() => useAccueilHome({ deps: { fetchAccueilHome: fetcher } }));
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useDailyDrill", () => {
  it("never throws; error envelope on refetch keeps the previous snapshot", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ itemCount: 4, reason: "ok" })
      .mockResolvedValueOnce({ itemCount: 0, reason: "error" });
    const { result } = renderHook(() => useDailyDrill({ deps: { fetchDailyDrill: fetcher } }));
    await waitFor(() =>
      expect(result.current.recommendation).toEqual({ itemCount: 4, reason: "ok" })
    );
    await act(() => result.current.refetch());
    expect(result.current.recommendation).toEqual({ itemCount: 4, reason: "ok" });
  });
});

describe("useReadinessSignal + useHeroState", () => {
  it("subscribes to live slot transitions and stamps shownAt per submissionId", async () => {
    const { result } = renderHook(() => useReadinessSignal({ _now: () => 5_000 }));
    expect(result.current.signal).toBeNull();
    act(() => markSubmissionInFlight("s1", "schreiben"));
    await waitFor(() => expect(result.current.signal?.submissionId).toBe("s1"));
    expect(result.current.shownAt).toBe(5_000);
  });

  it("only a ready slot flips the hero to post-session (in-flight stays countdown)", async () => {
    const accueilHome = {
      data: home,
      isLoading: false,
      isError: false,
      isRefetching: false,
      refetch: async () => {},
    };
    const { result } = renderHook(() => useHeroState({ _accueilHome: accueilHome }));
    expect(result.current.state).toBe("countdown");
    act(() => markSubmissionInFlight("s2", "sprechen"));
    await waitFor(() => expect(result.current.state).toBe("countdown")); // StatusStrip owns in-flight
    act(() => markCorrectionReady("s2"));
    await waitFor(() => expect(result.current.state).toBe("post-session"));
    expect(result.current.payload.readinessPulse).toBe("Une nouvelle correction t'attend.");
  });
});

describe("useHistory", () => {
  it("first page replaces, loadMore appends, hasMore follows nextCursor", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(page(["a", "b"], "c1"))
      .mockResolvedValueOnce(page(["c"], null));
    const { result } = renderHook(() => useHistory({ deps: { fetchHistory: fetcher } }));
    await waitFor(() => expect(result.current.feed.map((r) => r.id)).toEqual(["a", "b"]));
    expect(result.current.hasMore).toBe(true);
    await act(() => result.current.loadMore());
    expect(result.current.feed.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(result.current.hasMore).toBe(false);
    await act(() => result.current.loadMore()); // no-op past the end
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1]![0]).toEqual({ cursor: "c1", limit: 20 });
  });
});
