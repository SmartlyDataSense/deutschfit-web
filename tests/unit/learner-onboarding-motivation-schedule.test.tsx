import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace, back: vi.fn() }) }));
vi.mock("next-intl", () => ({ useLocale: () => "fr" }));
const trackEvent = vi.fn();
vi.mock("@/learner/core/analytics/posthog", async (o) => ({
  ...(await o<object>()),
  trackEvent: (...a: unknown[]) => trackEvent(...a),
}));
const finish = vi.fn().mockResolvedValue(undefined);
vi.mock("@/learner/onboarding/useFinishOnboarding", () => ({
  useFinishOnboarding: () => ({ busy: false, finish }),
}));

import { initLearnerI18n } from "@/learner/core/i18n";
import { LearnerI18nProvider } from "@/learner/core/i18n/LearnerI18nProvider";
import { useOnboardingAnswers } from "@/learner/onboarding/state/useOnboardingAnswers";
import { MotivationScreen } from "@/learner/onboarding/screens/MotivationScreen";
import { ScheduleScreen } from "@/learner/onboarding/screens/ScheduleScreen";

beforeAll(() => {
  initLearnerI18n("fr");
});
beforeEach(() => {
  vi.clearAllMocks();
  useOnboardingAnswers.getState().reset();
});
afterEach(() => {
  cleanup();
});

const wrap = (ui: React.ReactElement) =>
  render(<LearnerI18nProvider lng="fr">{ui}</LearnerI18nProvider>);

describe("MotivationScreen (step 2/3)", () => {
  it("renders 5 options; continue disabled until one is selected; then routes to schedule", () => {
    wrap(<MotivationScreen />);
    for (const k of ["travel", "work", "studies", "immigration", "other"]) {
      expect(screen.getByTestId(`onboarding-motivation-option-${k}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId("onboarding-motivation-continue")).toBeDisabled();
    fireEvent.click(screen.getByTestId("onboarding-motivation-option-work"));
    expect(screen.getByTestId("onboarding-motivation-option-work")).toHaveAttribute(
      "aria-checked",
      "true"
    );
    fireEvent.click(screen.getByTestId("onboarding-motivation-continue"));
    expect(trackEvent).toHaveBeenCalledWith("onboarding_step_completed", {
      step: "motivation",
      index: 2,
    });
    expect(push).toHaveBeenCalledWith("/fr/app/onboarding/schedule");
    expect(useOnboardingAnswers.getState().motivation).toBe("work");
  });

  it("Ignorer skips this step only — advances to Schedule (step 3/3), does NOT finish onboarding (#53)", () => {
    // Motivation is step 2/3, not the wizard's last step — "Ignorer" here
    // must not end onboarding early. Only Schedule (the actual finale)
    // may call `finish()`.
    wrap(<MotivationScreen />);
    fireEvent.click(screen.getByTestId("onboarding-skip"));
    expect(push).toHaveBeenCalledWith("/fr/app/onboarding/schedule");
    expect(finish).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("ScheduleScreen (step 3/3, auto-finish)", () => {
  it("renders 6 minute options with the intensif caveat only on 60", () => {
    wrap(<ScheduleScreen />);
    for (const v of ["5", "10", "20", "30", "45", "60"]) {
      expect(screen.getByTestId(`onboarding-schedule-option-${v}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId("onboarding-schedule-caveat-60")).toBeInTheDocument();
    expect(screen.queryByTestId("onboarding-schedule-caveat-30")).toBeNull();
  });

  it("continue tracks step 3, finishes, and replaces to /fr/app (no celebration screen)", async () => {
    wrap(<ScheduleScreen />);
    expect(screen.getByTestId("onboarding-schedule-continue")).toBeDisabled();
    fireEvent.click(screen.getByTestId("onboarding-schedule-option-20"));
    fireEvent.click(screen.getByTestId("onboarding-schedule-continue"));
    expect(trackEvent).toHaveBeenCalledWith("onboarding_step_completed", {
      step: "schedule",
      index: 3,
    });
    await waitFor(() => expect(finish).toHaveBeenCalled());
    expect(replace).toHaveBeenCalledWith("/fr/app");
    expect(useOnboardingAnswers.getState().schedule).toBe("20");
  });

  it("skip finishes without requiring a selection", async () => {
    wrap(<ScheduleScreen />);
    fireEvent.click(screen.getByTestId("onboarding-skip"));
    await waitFor(() => expect(finish).toHaveBeenCalled());
    expect(replace).toHaveBeenCalledWith("/fr/app");
  });
});
