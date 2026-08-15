/**
 * `DrillSessionScreen` — S9 · Task 9.6, review fix round 1.
 *
 * Regression coverage for the review finding: `DrillEmptyState`'s
 * `onRetry` (rendered only for `reason === "error"`) must trigger a
 * genuine re-fetch of the recommendation (`useDrillSession.retry()`,
 * which mirrors `useDrillSession`'s own composition logic), not
 * `router.back()`. The bug being guarded against is specifically a
 * *wiring* mistake in the screen component — a hook-level test of
 * `retry()` alone would not have caught a prop mis-wire in
 * `DrillSessionScreen.tsx`, so this suite renders the real screen and
 * clicks the real "Réessayer" button.
 */
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { pushMock, replaceMock, backMock, fetchDrillRecommendationMock, submitDrillAttemptMock } =
  vi.hoisted(() => ({
    pushMock: vi.fn(),
    replaceMock: vi.fn(),
    backMock: vi.fn(),
    fetchDrillRecommendationMock: vi.fn(),
    submitDrillAttemptMock: vi.fn(),
  }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock, back: backMock }),
}));

// Partial mock: keep the real `useExamContextStore` (driven directly via
// `setState` below), stub `hydrateExamContext` so the screen's mount
// effect doesn't hit localStorage/Supabase — same pattern as
// `learner-lesen-intro.test.tsx`.
const { hydrateMock } = vi.hoisted(() => ({ hydrateMock: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/learner/core/exam/examContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/core/exam/examContext")>();
  return { ...actual, hydrateExamContext: hydrateMock };
});

vi.mock("@/learner/drill/api/drillClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/drill/api/drillClient")>();
  return {
    ...actual,
    fetchDrillRecommendation: fetchDrillRecommendationMock,
    submitDrillAttempt: submitDrillAttemptMock,
  };
});

import { __resetLearnerDbForTests } from "@/learner/core/db";
import { useExamContextStore } from "@/learner/core/exam/examContext";
import { DrillSessionScreen } from "@/learner/drill/screens/DrillSessionScreen";

beforeEach(() => {
  __resetLearnerDbForTests();
  pushMock.mockReset();
  replaceMock.mockReset();
  backMock.mockReset();
  fetchDrillRecommendationMock.mockReset();
  submitDrillAttemptMock.mockReset();
  submitDrillAttemptMock.mockResolvedValue({ ok: true, is_correct: true });
  useExamContextStore.setState({ board: "goethe", level: "b1", isLoaded: true } as never);
});

afterEach(() => {
  cleanup();
});

function mockErrorSession(): void {
  // redo fails -> [] "error"; redoItems.length (0) < SESSION_SIZE, so the
  // daily top-up fires too and also fails -> final reason stays "error".
  fetchDrillRecommendationMock.mockResolvedValue({ items: [], reason: "error" });
}

describe("DrillEmptyState onRetry (error branch)", () => {
  it("clicking Réessayer re-invokes the recommendation fetch, not the router", async () => {
    mockErrorSession();

    render(<DrillSessionScreen />);

    const retryButton = await screen.findByTestId("drill-session-empty-retry");
    expect(screen.getByText("Petit souci")).toBeInTheDocument();

    const callsBeforeRetry = fetchDrillRecommendationMock.mock.calls.length;
    expect(callsBeforeRetry).toBeGreaterThan(0); // mount already fetched once

    await act(async () => {
      retryButton.click();
    });

    await waitFor(() =>
      expect(fetchDrillRecommendationMock.mock.calls.length).toBeGreaterThan(callsBeforeRetry)
    );
    // The whole point of the fix: a real re-fetch, never a silent exit.
    expect(backMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("a successful retry replaces the empty state with the first question", async () => {
    mockErrorSession();
    render(<DrillSessionScreen />);

    const retryButton = await screen.findByTestId("drill-session-empty-retry");

    fetchDrillRecommendationMock.mockResolvedValue({
      items: [
        {
          id: "item-1",
          concept_code: "kasus_akkusativ",
          before_de: "Ich sehe",
          after_de: "Mann.",
          answer_de: "den",
          distractors_de: ["dem", "der"],
          explanation_fr: "Accusatif masculin.",
        },
      ],
      reason: "ok",
    });

    await act(async () => {
      retryButton.click();
    });

    await waitFor(() =>
      expect(screen.getByTestId("drill-session-question-label")).toBeInTheDocument()
    );
    expect(screen.queryByTestId("drill-session-empty")).not.toBeInTheDocument();
  });
});

describe("DrillEmptyState non-error reasons", () => {
  it("renders no retry affordance for a non-error reason (e.g. no_gaps_yet)", async () => {
    fetchDrillRecommendationMock.mockResolvedValue({ items: [], reason: "no_gaps_yet" });

    render(<DrillSessionScreen />);

    await screen.findByTestId("drill-session-empty");
    expect(screen.queryByTestId("drill-session-empty-retry")).not.toBeInTheDocument();
  });
});
