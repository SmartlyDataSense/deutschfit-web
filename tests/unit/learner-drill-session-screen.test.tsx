/**
 * `DrillSessionScreen` — S9 · Task 9.6, review fix round 1; locale pin
 * added task 8 (#39).
 *
 * Regression coverage for the review finding: `DrillEmptyState`'s
 * `onRetry` (rendered only for `reason === "error"`) must trigger a
 * genuine re-fetch of the recommendation (`useDrillSession.retry()`,
 * which mirrors `useDrillSession`'s own composition logic), not
 * `router.back()`. The bug being guarded against is specifically a
 * *wiring* mistake in the screen component — a hook-level test of
 * `retry()` alone would not have caught a prop mis-wire in
 * `DrillSessionScreen.tsx`, so this suite renders the real screen and
 * clicks the real retry button.
 *
 * `SessionMcqCard`, `SessionResults`, and `DrillEmptyState` all render
 * through `drill:*` catalog keys as of task 8 (#39) — every render below
 * now needs a real `LearnerI18nProvider`, following the same
 * `initLearnerI18n` + provider-wrap idiom as
 * `learner-drill-skills.test.tsx` / `learner-accueil-screen.test.tsx`.
 */
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
import { initLearnerI18n, whenEnReady } from "@/learner/core/i18n";
import { LearnerI18nProvider } from "@/learner/core/i18n/LearnerI18nProvider";
import type { DrillItem } from "@/learner/drill/api/drillClient";
import { DrillSessionScreen } from "@/learner/drill/screens/DrillSessionScreen";

beforeAll(() => initLearnerI18n("fr"));

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

function renderScreen(lng: "fr" | "en" = "fr") {
  return render(
    <LearnerI18nProvider lng={lng}>
      <DrillSessionScreen />
    </LearnerI18nProvider>
  );
}

function mockErrorSession(): void {
  // redo fails -> [] "error"; redoItems.length (0) < SESSION_SIZE, so the
  // daily top-up fires too and also fails -> final reason stays "error".
  fetchDrillRecommendationMock.mockResolvedValue({ items: [], reason: "error" });
}

/** One MCQ item, reused for every position in a mocked SESSION_SIZE-length session. */
function makeDrillItem(id: string): DrillItem {
  return {
    id,
    concept_code: "kasus_akkusativ",
    before_de: "Ich sehe",
    after_de: "Mann.",
    answer_de: "den",
    distractors_de: ["dem", "der"],
    explanation_fr: "Accusatif masculin.",
  };
}

/** `SESSION_SIZE` (5) identical items — redo alone fills the session, no daily top-up call. */
function fullSessionItems(): DrillItem[] {
  return Array.from({ length: 5 }, (_, i) => makeDrillItem(`item-${i}`));
}

describe("DrillEmptyState onRetry (error branch)", () => {
  it("clicking Réessayer re-invokes the recommendation fetch, not the router", async () => {
    mockErrorSession();

    renderScreen();

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
    renderScreen();

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

    renderScreen();

    await screen.findByTestId("drill-session-empty");
    expect(screen.queryByTestId("drill-session-empty-retry")).not.toBeInTheDocument();
  });
});

/**
 * Locale pin — task 8 (#39). Before this task, `SessionMcqCard`,
 * `SessionResults`, and `DrillEmptyState` hardcoded French regardless of
 * the active locale: an `en` learner (the default locale,
 * `defaultLocale: "en"` + `localePrefix: "always"`) read French mid-flow.
 * One assertion per component, fr vs en, pinning that each now renders
 * through `drill:*` rather than a literal string.
 */
describe("adaptive-drill copy — locale pin (#39)", () => {
  it("DrillEmptyState: renders fr by default, en under an en boot", async () => {
    mockErrorSession();
    renderScreen("fr");
    expect(await screen.findByText("Petit souci")).toBeInTheDocument();
    cleanup();

    mockErrorSession();
    await whenEnReady();
    renderScreen("en");
    expect(await screen.findByText("Small hitch")).toBeInTheDocument();
  });

  it("SessionMcqCard: the continue label renders fr by default, en under an en boot", async () => {
    // `.textContent` exact equality, not `toHaveTextContent` (jest-dom's
    // default substring match) — "Continue" is a substring of "Continuer",
    // so a substring check would pass even against an un-fixed hardcoded
    // FR string and silently fail to pin anything on the en side.
    fetchDrillRecommendationMock.mockResolvedValueOnce({ items: fullSessionItems(), reason: "ok" });
    renderScreen("fr");
    const frOption = await screen.findByTestId("drill-session-mcq-option-den");
    await act(async () => {
      frOption.click();
    });
    expect((await screen.findByTestId("drill-session-mcq-continue")).textContent).toBe("Continuer");
    cleanup();

    fetchDrillRecommendationMock.mockResolvedValueOnce({ items: fullSessionItems(), reason: "ok" });
    await whenEnReady();
    renderScreen("en");
    const enOption = await screen.findByTestId("drill-session-mcq-option-den");
    await act(async () => {
      enOption.click();
    });
    expect((await screen.findByTestId("drill-session-mcq-continue")).textContent).toBe("Continue");
  });

  it("SessionResults: the finish label renders fr by default, en under an en boot", async () => {
    async function completeSession(): Promise<void> {
      for (let i = 0; i < 5; i += 1) {
        const option = await screen.findByTestId("drill-session-mcq-option-den");
        await act(async () => {
          option.click();
        });
        const continueButton = await screen.findByTestId("drill-session-mcq-continue");
        await act(async () => {
          continueButton.click();
        });
      }
    }

    fetchDrillRecommendationMock.mockResolvedValueOnce({ items: fullSessionItems(), reason: "ok" });
    renderScreen("fr");
    await completeSession();
    expect((await screen.findByTestId("drill-session-results-finish")).textContent).toBe(
      "Terminer"
    );
    cleanup();

    fetchDrillRecommendationMock.mockResolvedValueOnce({ items: fullSessionItems(), reason: "ok" });
    await whenEnReady();
    renderScreen("en");
    await completeSession();
    expect((await screen.findByTestId("drill-session-results-finish")).textContent).toBe("Finish");
  });
});
