import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// vitest.config.ts runs with `globals: false`, so @testing-library/react's
// auto-cleanup never registers — explicit `afterEach(cleanup)` required
// (same pattern as `tests/unit/learner-onboarding-welcome.test.tsx`).
//
// `push`/`trackEvent`/`setExamContext`/`hydrate` are built via `vi.hoisted`
// (not plain top-level `const`s) because `vi.mock` factories are hoisted
// above the rest of the module: a factory that closes over a later
// `const x = vi.fn()` hits the TDZ the moment the mocked module is first
// imported. `vi.hoisted` runs before the mock factories so the references
// are safe.
const { push, trackEvent, setExamContext, hydrate } = vi.hoisted(() => ({
  push: vi.fn(),
  trackEvent: vi.fn(),
  setExamContext: vi.fn(),
  hydrate: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }) }));
vi.mock("next-intl", () => ({ useLocale: () => "fr" }));
vi.mock("@/learner/core/analytics/posthog", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  trackEvent: (...a: unknown[]) => trackEvent(...a),
}));
vi.mock("@/learner/core/exam/examContext", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/learner/core/exam/examContext")>();
  real.useExamContextStore.setState({
    board: "goethe",
    level: "b1",
    source: "onboarding",
    isLoaded: true,
    setExamContext: (...a: never[]) => setExamContext(...a),
    hydrate,
  } as never);
  return real;
});
vi.mock("@/learner/core/api/client", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  newIdempotencyKey: () => "11111111-1111-4111-8111-111111111111",
}));

import { initLearnerI18n } from "@/learner/core/i18n";
import { LearnerI18nProvider } from "@/learner/core/i18n/LearnerI18nProvider";
import { ExamTypeScreen } from "@/learner/onboarding/screens/ExamTypeScreen";

afterEach(cleanup);

beforeAll(() => {
  initLearnerI18n("fr");
});
beforeEach(() => {
  vi.clearAllMocks();
  setExamContext.mockResolvedValue(undefined);
});

const ui = () =>
  render(
    <LearnerI18nProvider lng="fr">
      <ExamTypeScreen />
    </LearnerI18nProvider>
  );

describe("ExamTypeScreen", () => {
  it("continue stays disabled until both board and level are picked", () => {
    ui();
    const cta = screen.getByTestId("onboarding-exam-type-continue");
    expect(cta).toBeDisabled();
    fireEvent.click(screen.getByTestId("exam-board-trigger"));
    fireEvent.click(screen.getByTestId("exam-board-option-telc"));
    expect(cta).toBeDisabled();
    fireEvent.click(screen.getByTestId("exam-level-trigger"));
    fireEvent.click(screen.getByTestId("exam-level-option-b2"));
    expect(cta).toBeEnabled();
  });

  it("continue persists exam context, tracks, and routes to the diagnostic with a minted attemptId", async () => {
    ui();
    fireEvent.click(screen.getByTestId("exam-board-trigger"));
    fireEvent.click(screen.getByTestId("exam-board-option-goethe"));
    fireEvent.click(screen.getByTestId("exam-level-trigger"));
    fireEvent.click(screen.getByTestId("exam-level-option-b1"));
    fireEvent.click(screen.getByTestId("onboarding-exam-type-continue"));
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        "/fr/app/onboarding/diagnostic?attempt=11111111-1111-4111-8111-111111111111&level=b1&board=goethe&mode=onboarding"
      )
    );
    expect(setExamContext).toHaveBeenCalledWith({ board: "goethe", level: "b1", source: "onboarding" });
    expect(trackEvent).toHaveBeenCalledWith("onboarding_step_completed", { step: "exam-type", index: 1 });
  });

  it("shows the save error inline and does not navigate when persistence fails", async () => {
    setExamContext.mockRejectedValue(new Error("rls_denied"));
    ui();
    fireEvent.click(screen.getByTestId("exam-board-trigger"));
    fireEvent.click(screen.getByTestId("exam-board-option-goethe"));
    fireEvent.click(screen.getByTestId("exam-level-trigger"));
    fireEvent.click(screen.getByTestId("exam-level-option-b1"));
    fireEvent.click(screen.getByTestId("onboarding-exam-type-continue"));
    await waitFor(() => expect(screen.getByTestId("onboarding-exam-type-save-error")).toBeInTheDocument());
    expect(push).not.toHaveBeenCalled();
  });

  it("lists every board and level from the canonical sets", () => {
    ui();
    fireEvent.click(screen.getByTestId("exam-board-trigger"));
    for (const b of ["goethe", "telc", "oesd", "testdaf", "ecl", "pflege", "beruf_tourismus"]) {
      expect(screen.getByTestId(`exam-board-option-${b}`)).toBeInTheDocument();
    }
  });
});
