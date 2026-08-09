import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("next-intl", () => ({ useLocale: () => "fr" }));
const fetchHistory = vi.fn();
vi.mock("@/learner/core/api/history", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/core/api/history")>();
  return { ...actual, fetchHistory: (...a: unknown[]) => fetchHistory(...a) };
});

import { initLearnerI18n } from "@/learner/core/i18n";
import { LearnerI18nProvider } from "@/learner/core/i18n/LearnerI18nProvider";
import { PerformanceHistoryScreen } from "@/learner/accueil/screens/PerformanceHistoryScreen";

afterEach(cleanup);
beforeAll(() => initLearnerI18n("fr"));
const ui = () =>
  render(
    <LearnerI18nProvider lng="fr">
      <PerformanceHistoryScreen />
    </LearnerI18nProvider>
  );

const row = (over: Record<string, unknown>) => ({
  id: "r1",
  kind: "schreiben",
  createdAt: "2026-08-01T10:00:00Z",
  score: 18,
  scoreMax: 24,
  level: "b1.2",
  board: "goethe",
  title: "Une lettre formelle",
  status: "graded",
  errorMessage: null,
  deepLinkRoute: { screen: "Feedback", params: { runId: "r1" } },
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("PerformanceHistoryScreen", () => {
  it("renders pinned diagnostic (level, delta, retake link) + graded row with board/level pills", async () => {
    fetchHistory.mockResolvedValue({
      pinnedDiagnostic: {
        latest: { attemptId: "a1", estimatedLevel: "b1.2", submittedAt: "2026-07-01T09:00:00Z" },
        previous: null,
        deltaLabel: "+1 niveau depuis le 1er mars",
      },
      feed: [row({})],
      nextCursor: null,
    });
    ui();
    await waitFor(() =>
      expect(screen.getByTestId("performance-history-pinned-level")).toHaveTextContent("B1.2")
    );
    expect(screen.getByTestId("performance-history-pinned-delta")).toHaveTextContent(
      "+1 niveau depuis le 1er mars"
    );
    // P17 (S6 Task 6.9) — the default fixture row is `kind: "schreiben"`,
    // so it's now a real button (no `aria-disabled`); see the dedicated
    // P17 tests below for the sprechen `aria-disabled` contrast.
    expect(screen.getByTestId("performance-history-row-r1").tagName).toBe("BUTTON");
    expect(screen.getByTestId("performance-history-row-r1")).not.toHaveAttribute("aria-disabled");
    expect(screen.getByTestId("performance-history-row-board-r1")).toHaveTextContent("Goethe");
    expect(screen.getByTestId("performance-history-row-level-r1")).toHaveTextContent("B1.2");
    expect(screen.getByTestId("performance-history-row-title-r1")).toHaveTextContent(
      "Une lettre formelle"
    );
    fireEvent.click(screen.getByTestId("performance-history-pinned-retake"));
    expect(push).toHaveBeenCalledWith("/fr/app/onboarding/diagnostic?mode=retake");
  });

  it("rejected sprechen row shows 'Non évaluée' + the too-short subtitle, no score", async () => {
    fetchHistory.mockResolvedValue({
      pinnedDiagnostic: null,
      feed: [
        row({
          id: "r2",
          kind: "sprechen",
          status: "rejected",
          errorMessage: "duration_too_short",
          title: null,
        }),
      ],
      nextCursor: null,
    });
    ui();
    await waitFor(() =>
      expect(screen.getByTestId("performance-history-row-rejected-pill-r2")).toBeInTheDocument()
    );
    expect(screen.queryByText("18/24")).toBeNull();
    // no-diagnostic branch renders the empty pinned card with its CTA
    expect(screen.getByTestId("performance-history-pinned-empty-cta")).toBeInTheDocument();
  });

  // P17 (S6 Task 6.9, Constraint 8) — a Schreiben row's id IS its
  // submission id, so tap-through is a direct feedback-screen navigation.
  // Sprechen has no feedback screen yet (S7) and keeps the S3
  // `aria-disabled` non-interactive contract.
  it("a graded schreiben row is a real button navigating to the feedback route; a sprechen row keeps aria-disabled", async () => {
    fetchHistory.mockResolvedValue({
      pinnedDiagnostic: null,
      feed: [
        row({ id: "r1", kind: "schreiben" }),
        row({ id: "r3", kind: "sprechen", title: "Sprechen — Teil 2" }),
      ],
      nextCursor: null,
    });
    ui();
    await waitFor(() =>
      expect(screen.getByTestId("performance-history-row-r1")).toBeInTheDocument()
    );

    const schreibenRow = screen.getByTestId("performance-history-row-r1");
    expect(schreibenRow.tagName).toBe("BUTTON");
    expect(schreibenRow).not.toHaveAttribute("aria-disabled");
    fireEvent.click(schreibenRow);
    expect(push).toHaveBeenCalledWith("/fr/app/schreiben/feedback/r1");

    const sprechenRow = screen.getByTestId("performance-history-row-r3");
    expect(sprechenRow.tagName).toBe("DIV");
    expect(sprechenRow).toHaveAttribute("aria-disabled", "true");
  });

  it("a rejected schreiben row is also a real button (kind === schreiben applies to graded AND rejected)", async () => {
    fetchHistory.mockResolvedValue({
      pinnedDiagnostic: null,
      feed: [
        row({
          id: "r4",
          kind: "schreiben",
          status: "rejected",
          errorMessage: "language_not_german",
          title: null,
        }),
      ],
      nextCursor: null,
    });
    ui();
    await waitFor(() =>
      expect(screen.getByTestId("performance-history-row-r4")).toBeInTheDocument()
    );
    const schreibenRejectedRow = screen.getByTestId("performance-history-row-r4");
    expect(schreibenRejectedRow.tagName).toBe("BUTTON");
    fireEvent.click(schreibenRejectedRow);
    expect(push).toHaveBeenCalledWith("/fr/app/schreiben/feedback/r4");
  });

  it("empty feed renders the calm empty card; error renders retry", async () => {
    fetchHistory.mockResolvedValueOnce({ pinnedDiagnostic: null, feed: [], nextCursor: null });
    ui();
    await waitFor(() =>
      expect(screen.getByTestId("performance-history-feed-empty")).toBeInTheDocument()
    );
    cleanup();
    fetchHistory.mockRejectedValueOnce(new Error("net"));
    ui();
    await waitFor(() =>
      expect(screen.getByTestId("performance-history-error")).toBeInTheDocument()
    );
  });

  it("root testID scopes the whole screen (nav bar + pinned card are descendants)", async () => {
    fetchHistory.mockResolvedValue({
      pinnedDiagnostic: {
        latest: { attemptId: "a1", estimatedLevel: "b1.2", submittedAt: "2026-07-01T09:00:00Z" },
        previous: null,
        deltaLabel: null,
      },
      feed: [],
      nextCursor: null,
    });
    ui();
    await waitFor(() =>
      expect(screen.getByTestId("performance-history-pinned-card")).toBeInTheDocument()
    );
    const screenRoot = screen.getByTestId("performance-history-screen");
    expect(screenRoot).toContainElement(screen.getByTestId("performance-history-back-button"));
    expect(screenRoot).toContainElement(screen.getByTestId("performance-history-pinned-card"));
  });

  it("sentinel intersection loads the next cursor, an in-flight second intersection does not double-fire, and unmount disconnects the observer", async () => {
    // Real (fake) IntersectionObserver — jsdom has none. Captures the
    // callback + tracks observe/disconnect calls so the test can drive
    // the intersection lifecycle deterministically instead of relying on
    // a real layout/viewport.
    class FakeIntersectionObserver {
      static instances: FakeIntersectionObserver[] = [];
      callback: IntersectionObserverCallback;
      disconnected = false;
      observedNodes: Element[] = [];
      constructor(callback: IntersectionObserverCallback) {
        this.callback = callback;
        FakeIntersectionObserver.instances.push(this);
      }
      observe(node: Element) {
        this.observedNodes.push(node);
      }
      unobserve() {}
      disconnect() {
        this.disconnected = true;
      }
      takeRecords() {
        return [];
      }
      root = null;
      rootMargin = "";
      thresholds: readonly number[] = [];
    }
    const originalIO = globalThis.IntersectionObserver;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only global stub, jsdom ships no IntersectionObserver type to satisfy.
    (globalThis as any).IntersectionObserver = FakeIntersectionObserver;

    try {
      let resolvePage2: ((value: unknown) => void) | undefined;
      const page2Promise = new Promise((resolve) => {
        resolvePage2 = resolve;
      });
      fetchHistory.mockResolvedValueOnce({
        pinnedDiagnostic: null,
        feed: [row({ id: "r1" })],
        nextCursor: "cursor-1",
      });
      fetchHistory.mockImplementationOnce(() => page2Promise);

      ui();
      await waitFor(() =>
        expect(screen.getByTestId("history-load-more-sentinel")).toBeInTheDocument()
      );
      expect(fetchHistory).toHaveBeenCalledTimes(1);

      const observer = FakeIntersectionObserver.instances[0];
      if (!observer) throw new Error("expected an IntersectionObserver instance to be created");
      expect(observer.observedNodes).toContain(screen.getByTestId("history-load-more-sentinel"));

      // (a) intersect → loadMore fires with the current cursor.
      observer.callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        observer as unknown as IntersectionObserver
      );
      await waitFor(() => expect(fetchHistory).toHaveBeenCalledTimes(2));
      expect(fetchHistory).toHaveBeenLastCalledWith(
        expect.objectContaining({ cursor: "cursor-1" })
      );
      // Wait for `isLoadingMore` to actually flip (and the ref the
      // observer callback reads to catch up) before firing the second
      // intersection, so this reproduces the real race — a second
      // intersection landing *while* the first fetch is in flight.
      await waitFor(() =>
        expect(screen.getByTestId("performance-history-loading-more")).toBeInTheDocument()
      );

      // (b) a second intersection while the first load is still in
      // flight (page2Promise unresolved) must NOT double-fire.
      observer.callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        observer as unknown as IntersectionObserver
      );
      await Promise.resolve();
      await Promise.resolve();
      expect(fetchHistory).toHaveBeenCalledTimes(2);

      resolvePage2?.({
        pinnedDiagnostic: null,
        feed: [row({ id: "r1" }), row({ id: "r2" })],
        nextCursor: "cursor-2",
      });
      await waitFor(() =>
        expect(screen.getByTestId("performance-history-row-r2")).toBeInTheDocument()
      );
      expect(screen.queryByTestId("performance-history-loading-more")).toBeNull();
      // Still only 2 fetches total — the guarded second intersection
      // never reached `loadMore`.
      expect(fetchHistory).toHaveBeenCalledTimes(2);

      // (c) unmount disconnects the observer.
      cleanup();
      expect(observer.disconnected).toBe(true);
    } finally {
      globalThis.IntersectionObserver = originalIO;
    }
  });
});
