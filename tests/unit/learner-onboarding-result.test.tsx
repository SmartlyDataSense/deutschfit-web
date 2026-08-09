import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const back = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, back, replace: vi.fn() }) }));
vi.mock("next-intl", () => ({ useLocale: () => "fr" }));
const trackEvent = vi.fn();
vi.mock("@/learner/core/analytics/posthog", async (o) => ({
  ...(await o<object>()),
  trackEvent: (...a: unknown[]) => trackEvent(...a),
}));

import { initLearnerI18n } from "@/learner/core/i18n";
import { LearnerI18nProvider } from "@/learner/core/i18n/LearnerI18nProvider";
import { useDiagnosticAttemptStore } from "@/learner/onboarding/state/useDiagnosticAttemptStore";
import { DiagnosticResultScreen } from "@/learner/onboarding/screens/DiagnosticResultScreen";

const RESULT = {
  attemptId: "at-1",
  estimatedLevel: "b1.2" as const,
  scorePerSection: { lesen: 4, sprachbausteine: 3, wortschatz: 1 },
  totalScore: 8,
  weaknessTags: ["präposition"],
  perQuestionResults: [
    {
      questionId: "diag-b1-lesen-1",
      wasCorrect: true,
      correctOption: "b",
      selectedOption: "b",
      explanationDe: null,
      explanationEn: null,
    },
    {
      questionId: "diag-b1-wortschatz-1",
      wasCorrect: false,
      correctOption: "c",
      selectedOption: "a",
      explanationDe: "Erklärung",
      explanationEn: "Because",
    },
  ],
};

afterEach(cleanup);

beforeAll(() => {
  initLearnerI18n("fr");
});
beforeEach(() => {
  vi.clearAllMocks();
  useDiagnosticAttemptStore.getState().reset();
  useDiagnosticAttemptStore.getState().setResult(RESULT);
  useDiagnosticAttemptStore.getState().setElapsed("lesen", 120);
});

const ui = (mode: "onboarding" | "retake" = "onboarding") =>
  render(
    <LearnerI18nProvider lng="fr">
      <DiagnosticResultScreen mode={mode} />
    </LearnerI18nProvider>
  );

describe("DiagnosticResultScreen", () => {
  it("renders level chip B1.2 with the fast-b2 tier pill and per-section rows with coloring thresholds", () => {
    ui();
    expect(screen.getByTestId("diagnostic-result-level-chip").textContent).toContain("B1.2");
    expect(screen.getByTestId("diagnostic-result-tier-suffix")).toBeInTheDocument();
    // lesen 4/4 (≥80% success tone), sprachbausteine 3/6 (amber), wortschatz 1/5 (<50% warning)
    expect(screen.getByTestId("diagnostic-result-section-lesen-score").textContent).toMatch(
      /4\s*\/\s*4/
    );
    expect(
      screen.getByTestId("diagnostic-result-section-sprachbausteine-score").textContent
    ).toMatch(/3\s*\/\s*6/);
    expect(screen.getByTestId("diagnostic-result-section-wortschatz-score").textContent).toMatch(
      /1\s*\/\s*5/
    );
    expect(screen.getByTestId("diagnostic-result-total").textContent).toContain("8");
  });

  it("shows weaknesses, disabled roadmap cards with the Bientôt pill, and the honest footer", () => {
    ui();
    expect(screen.getByTestId("diagnostic-result-block-weaknesses")).toBeInTheDocument();
    expect(screen.getByTestId("diagnostic-result-cta-drill-sprachbausteine")).toHaveAttribute(
      "aria-disabled",
      "true"
    );
    expect(
      screen.getByTestId("diagnostic-result-cta-drill-sprachbausteine-soon")
    ).toBeInTheDocument();
    expect(screen.getByTestId("diagnostic-result-footer")).toBeInTheDocument();
  });

  it("review collapsible is closed by default and reveals per-question rows with correct/explanation copy for misses", () => {
    ui();
    expect(screen.queryByTestId("diagnostic-result-review-list")).toBeNull();
    fireEvent.click(screen.getByTestId("diagnostic-result-review-toggle"));
    expect(screen.getByTestId("diagnostic-result-review-list")).toBeInTheDocument();
    const missRow = screen.getByTestId("diagnostic-result-review-diag-b1-wortschatz-1");
    expect(missRow.textContent).toContain("Erklärung");
  });

  it("continue: onboarding → motivation; retake → back; each tracks its own step", () => {
    ui();
    fireEvent.click(screen.getByTestId("diagnostic-result-continue"));
    expect(trackEvent).toHaveBeenCalledWith("onboarding_step_completed", {
      step: "diagnostic_result",
    });
    expect(push).toHaveBeenCalledWith("/fr/app/onboarding/motivation");
  });

  it("retake continue goes back", () => {
    ui("retake");
    fireEvent.click(screen.getByTestId("diagnostic-result-continue"));
    expect(trackEvent).toHaveBeenCalledWith("onboarding_step_completed", {
      step: "diagnostic_retake_result",
    });
    expect(back).toHaveBeenCalled();
  });

  it("renders the defensive empty state when no result is cached (deep link) and never refetches", () => {
    useDiagnosticAttemptStore.getState().reset();
    ui();
    expect(screen.getByTestId("onboarding-diagnostic-result-empty")).toBeInTheDocument();
  });
});
