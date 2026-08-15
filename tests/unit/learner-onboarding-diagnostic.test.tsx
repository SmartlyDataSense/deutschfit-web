import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const back = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, back, replace }) }));
vi.mock("next-intl", () => ({ useLocale: () => "fr" }));
vi.mock("@/learner/core/analytics/posthog", async (o) => ({
  ...(await o<object>()),
  trackEvent: vi.fn(),
}));

const getDiagnosticQuestions = vi.fn();
vi.mock("@/learner/onboarding/services/getDiagnosticQuestions", async (o) => ({
  ...(await o<object>()),
  getDiagnosticQuestions: (...a: unknown[]) => getDiagnosticQuestions(...a),
}));
const submitDiagnostic = vi.fn();
vi.mock("@/learner/onboarding/services/submitDiagnostic", async (o) => ({
  ...(await o<object>()),
  submitDiagnostic: (...a: unknown[]) => submitDiagnostic(...a),
}));

import { initLearnerI18n } from "@/learner/core/i18n";
import { LearnerI18nProvider } from "@/learner/core/i18n/LearnerI18nProvider";
import { useDiagnosticAttemptStore } from "@/learner/onboarding/state/useDiagnosticAttemptStore";
import { DiagnosticScreen } from "@/learner/onboarding/screens/DiagnosticScreen";

const ATTEMPT = "11111111-1111-4111-8111-111111111111";

// 15-question pack fixture — same shape as Task 2.7's packFixture(), with
// questionIds l1..l4 / s1..s6 / w1..w5 and options a/b.
function packFixture() {
  const item = (id: string) => ({
    questionId: id,
    stemDe: `Stem ${id}`,
    tags: ["lesen"],
    categoryPillLabel: "B1 · Lesen",
    options: [
      { key: "a", label_de: "A" },
      { key: "b", label_de: "B" },
    ],
  });
  return {
    attemptId: ATTEMPT,
    level: "b1",
    issuedAt: "2026-08-09T10:00:00Z",
    expiresAt: "2026-08-09T11:00:00Z",
    bankExhausted: false,
    sections: [
      {
        kind: "lesen",
        durationSec: 300,
        readingText: null,
        items: [1, 2, 3, 4].map((i) => item(`l${i}`)),
      },
      {
        kind: "sprachbausteine",
        durationSec: 300,
        readingText: null,
        items: [1, 2, 3, 4, 5, 6].map((i) => item(`s${i}`)),
      },
      {
        kind: "wortschatz",
        durationSec: 180,
        readingText: null,
        items: [1, 2, 3, 4, 5].map((i) => item(`w${i}`)),
      },
    ],
  };
}

afterEach(cleanup);

beforeAll(() => {
  initLearnerI18n("fr");
});
beforeEach(() => {
  vi.clearAllMocks();
  useDiagnosticAttemptStore.getState().reset();
  getDiagnosticQuestions.mockResolvedValue(packFixture());
});
afterEach(() => {
  vi.useRealTimers();
});

const ui = (mode: "onboarding" | "retake" = "onboarding") =>
  render(
    <LearnerI18nProvider lng="fr">
      <DiagnosticScreen attemptId={ATTEMPT} level="b1" mode={mode} />
    </LearnerI18nProvider>
  );

describe("DiagnosticScreen", () => {
  it("fetches the pack for (attemptId, level) and shows section 1 with a 05:00 clock", async () => {
    ui();
    await waitFor(() =>
      expect(screen.getByTestId("onboarding-diagnostic-screen")).toBeInTheDocument()
    );
    expect(getDiagnosticQuestions).toHaveBeenCalledWith({ attemptId: ATTEMPT, level: "b1" });
    expect(screen.getByTestId("onboarding-diagnostic-eyebrow").textContent).toMatch(
      /LESEN · 1\/4 · 05:00/
    );
  });

  it("ticks the section clock down once per second while in progress", async () => {
    vi.useFakeTimers();
    ui();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    }); // flush fetch
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(screen.getByTestId("onboarding-diagnostic-eyebrow").textContent).toMatch(/04:57/);
  });

  it("validate is disabled until an option is selected, then records + advances", async () => {
    ui();
    await waitFor(() => screen.getByTestId("onboarding-diagnostic-cta"));
    expect(screen.getByTestId("onboarding-diagnostic-cta")).toBeDisabled();
    fireEvent.click(screen.getByTestId("onboarding-diagnostic-option-a"));
    fireEvent.click(screen.getByTestId("onboarding-diagnostic-cta"));
    await waitFor(() =>
      expect(screen.getByTestId("onboarding-diagnostic-eyebrow").textContent).toMatch(/2\/4/)
    );
    expect(useDiagnosticAttemptStore.getState().answers).toEqual({ l1: "a" });
  });

  it("crossing into section 2 shows SPRACHBAUSTEINE 1/6 at 05:00; section 3 shows 03:00", async () => {
    ui();
    await waitFor(() => screen.getByTestId("onboarding-diagnostic-cta"));
    for (let i = 0; i < 4; i++) {
      fireEvent.click(screen.getByTestId("onboarding-diagnostic-option-a"));
      fireEvent.click(screen.getByTestId("onboarding-diagnostic-cta"));
    }
    expect(screen.getByTestId("onboarding-diagnostic-eyebrow").textContent).toMatch(
      /SPRACHBAUSTEINE · 1\/6 · 05:00/
    );
    for (let i = 0; i < 6; i++) {
      fireEvent.click(screen.getByTestId("onboarding-diagnostic-option-a"));
      fireEvent.click(screen.getByTestId("onboarding-diagnostic-cta"));
    }
    expect(screen.getByTestId("onboarding-diagnostic-eyebrow").textContent).toMatch(
      /WORTSCHATZ · 1\/5 · 03:00/
    );
  });

  it("Q15 submit posts all answers + elapsed meta and routes to the result", async () => {
    submitDiagnostic.mockResolvedValue({
      attemptId: ATTEMPT,
      estimatedLevel: "b1.1",
      scorePerSection: { lesen: 4, sprachbausteine: 6, wortschatz: 5 },
      totalScore: 15,
      weaknessTags: [],
      perQuestionResults: [],
    });
    ui();
    await waitFor(() => screen.getByTestId("onboarding-diagnostic-cta"));
    for (let i = 0; i < 15; i++) {
      fireEvent.click(screen.getByTestId("onboarding-diagnostic-option-a"));
      fireEvent.click(screen.getByTestId("onboarding-diagnostic-cta"));
    }
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        `/fr/app/onboarding/result?attempt=${ATTEMPT}&mode=onboarding`
      )
    );
    const args = submitDiagnostic.mock.calls[0]![0] as { answers: Record<string, string> };
    expect(Object.keys(args.answers)).toHaveLength(15);
  });

  it("submit failure ×2 surfaces the error then the finish-later escape (onboarding → motivation)", async () => {
    submitDiagnostic.mockRejectedValue(new Error("diagnostic_submit_failed"));
    ui();
    await waitFor(() => screen.getByTestId("onboarding-diagnostic-cta"));
    for (let i = 0; i < 15; i++) {
      fireEvent.click(screen.getByTestId("onboarding-diagnostic-option-a"));
      fireEvent.click(screen.getByTestId("onboarding-diagnostic-cta"));
      if (i < 14) continue;
    }
    await waitFor(() => screen.getByTestId("onboarding-diagnostic-error"));
    expect(screen.queryByTestId("onboarding-diagnostic-skip")).toBeNull(); // 1 failure: no skip yet
    fireEvent.click(screen.getByTestId("onboarding-diagnostic-cta")); // retry → 2nd failure
    await waitFor(() => screen.getByTestId("onboarding-diagnostic-skip"));
    fireEvent.click(screen.getByTestId("onboarding-diagnostic-skip"));
    expect(push).toHaveBeenCalledWith("/fr/app/onboarding/motivation");
  });

  it("in retake mode, finish-later goes back instead of into the wizard", async () => {
    submitDiagnostic.mockRejectedValue(new Error("x"));
    ui("retake");
    await waitFor(() => screen.getByTestId("onboarding-diagnostic-cta"));
    for (let i = 0; i < 15; i++) {
      fireEvent.click(screen.getByTestId("onboarding-diagnostic-option-a"));
      fireEvent.click(screen.getByTestId("onboarding-diagnostic-cta"));
    }
    await waitFor(() => screen.getByTestId("onboarding-diagnostic-error"));
    fireEvent.click(screen.getByTestId("onboarding-diagnostic-cta"));
    await waitFor(() => screen.getByTestId("onboarding-diagnostic-skip"));
    fireEvent.click(screen.getByTestId("onboarding-diagnostic-skip"));
    expect(back).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalledWith("/fr/app/onboarding/motivation");
  });

  it("load failure shows the error surface with a retry that refetches", async () => {
    getDiagnosticQuestions.mockRejectedValueOnce(new Error("bank_underfilled"));
    ui();
    await waitFor(() => screen.getByTestId("onboarding-diagnostic-load-error"));
    fireEvent.click(screen.getByTestId("onboarding-diagnostic-retry"));
    await waitFor(() => screen.getByTestId("onboarding-diagnostic-screen"));
    expect(getDiagnosticQuestions).toHaveBeenCalledTimes(2);
  });

  // S13 Task 5 · Step 1 (M-2.9): the options list must expose ARIA
  // radiogroup semantics — the question prompt as the group's accessible
  // name, each option a `radio` with exactly one `aria-checked="true"`
  // once a selection is made.
  it("exposes the options as a radiogroup named by the question prompt, each option a radio with exactly one checked", async () => {
    ui();
    await waitFor(() => screen.getByTestId("onboarding-diagnostic-cta"));

    const group = screen.getByRole("radiogroup");
    expect(group).toHaveAccessibleName("Stem l1");

    const radiosBefore = screen.getAllByRole("radio");
    expect(radiosBefore).toHaveLength(2);
    expect(radiosBefore.every((r) => r.getAttribute("aria-checked") === "false")).toBe(true);

    fireEvent.click(screen.getByTestId("onboarding-diagnostic-option-a"));

    const radiosAfter = screen.getAllByRole("radio");
    const checked = radiosAfter.filter((r) => r.getAttribute("aria-checked") === "true");
    expect(checked).toHaveLength(1);
    expect(checked[0]).toBe(screen.getByTestId("onboarding-diagnostic-option-a"));
  });
});
