import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }) }));
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
const ui = () => render(<LearnerI18nProvider lng="fr"><PerformanceHistoryScreen /></LearnerI18nProvider>);

const row = (over: Record<string, unknown>) => ({
  id: "r1", kind: "schreiben", createdAt: "2026-08-01T10:00:00Z", score: 18, scoreMax: 24,
  level: "b1.2", board: "goethe", title: "Une lettre formelle", status: "graded", errorMessage: null,
  deepLinkRoute: { screen: "Feedback", params: { runId: "r1" } }, ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("PerformanceHistoryScreen", () => {
  it("renders pinned diagnostic (level, delta, retake link) + graded row with board/level pills", async () => {
    fetchHistory.mockResolvedValue({
      pinnedDiagnostic: {
        latest: { attemptId: "a1", estimatedLevel: "b1.2", submittedAt: "2026-07-01T09:00:00Z" },
        previous: null, deltaLabel: "+1 niveau depuis le 1er mars",
      },
      feed: [row({})], nextCursor: null,
    });
    ui();
    await waitFor(() => expect(screen.getByTestId("performance-history-pinned-level")).toHaveTextContent("B1.2"));
    expect(screen.getByTestId("performance-history-pinned-delta")).toHaveTextContent("+1 niveau depuis le 1er mars");
    expect(screen.getByTestId("performance-history-row-r1")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByTestId("performance-history-row-board-r1")).toHaveTextContent("Goethe");
    expect(screen.getByTestId("performance-history-row-level-r1")).toHaveTextContent("B1.2");
    expect(screen.getByTestId("performance-history-row-title-r1")).toHaveTextContent("Une lettre formelle");
    fireEvent.click(screen.getByTestId("performance-history-pinned-retake"));
    expect(push).toHaveBeenCalledWith("/fr/app/onboarding/diagnostic?mode=retake");
  });

  it("rejected sprechen row shows 'Non évaluée' + the too-short subtitle, no score", async () => {
    fetchHistory.mockResolvedValue({
      pinnedDiagnostic: null,
      feed: [row({ id: "r2", kind: "sprechen", status: "rejected", errorMessage: "duration_too_short", title: null })],
      nextCursor: null,
    });
    ui();
    await waitFor(() =>
      expect(screen.getByTestId("performance-history-row-rejected-pill-r2")).toBeInTheDocument());
    expect(screen.queryByText("18/24")).toBeNull();
    // no-diagnostic branch renders the empty pinned card with its CTA
    expect(screen.getByTestId("performance-history-pinned-empty-cta")).toBeInTheDocument();
  });

  it("empty feed renders the calm empty card; error renders retry", async () => {
    fetchHistory.mockResolvedValueOnce({ pinnedDiagnostic: null, feed: [], nextCursor: null });
    ui();
    await waitFor(() => expect(screen.getByTestId("performance-history-feed-empty")).toBeInTheDocument());
    cleanup();
    fetchHistory.mockRejectedValueOnce(new Error("net"));
    ui();
    await waitFor(() => expect(screen.getByTestId("performance-history-error")).toBeInTheDocument());
  });
});
