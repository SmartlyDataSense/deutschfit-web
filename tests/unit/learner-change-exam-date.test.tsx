import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const back = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back }),
}));
vi.mock("next-intl", () => ({ useLocale: () => "fr" }));
const updateExamDate = vi.fn();
vi.mock("@/learner/accueil/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/accueil/api")>();
  return { ...actual, updateExamDate: (...a: unknown[]) => updateExamDate(...a) };
});

import { initLearnerI18n } from "@/learner/core/i18n";
import { LearnerI18nProvider } from "@/learner/core/i18n/LearnerI18nProvider";
import { ChangeExamDateScreen } from "@/learner/accueil/screens/ChangeExamDateScreen";

afterEach(cleanup);
beforeAll(() => initLearnerI18n("fr"));
beforeEach(() => vi.clearAllMocks());
const ui = () =>
  render(
    <LearnerI18nProvider lng="fr">
      <ChangeExamDateScreen />
    </LearnerI18nProvider>
  );

function futureIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

describe("ChangeExamDateScreen", () => {
  it("saves the picked day then navigates back", async () => {
    updateExamDate.mockResolvedValue(undefined);
    ui();
    expect(screen.getByTestId("change-exam-date-title")).toBeInTheDocument();
    const iso = futureIso(21);
    fireEvent.click(screen.getByTestId(`change-exam-date-mini-calendar-day-${iso}`));
    await waitFor(() => expect(updateExamDate).toHaveBeenCalledWith(iso));
    await waitFor(() => expect(back).toHaveBeenCalled(), { timeout: 2_000 });
  });

  it("surfaces the error caption and stays when the write fails", async () => {
    updateExamDate.mockRejectedValue(new Error("rls"));
    ui();
    fireEvent.click(screen.getByTestId(`change-exam-date-mini-calendar-day-${futureIso(21)}`));
    await waitFor(() => expect(screen.getByTestId("change-exam-date-status")).toBeInTheDocument());
    expect(back).not.toHaveBeenCalled();
  });

  it("does not navigate back if the screen unmounts before a pending save resolves", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    let resolveUpdate: () => void = () => {};
    updateExamDate.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveUpdate = resolve;
        })
    );
    const { unmount } = ui();
    const iso = futureIso(21);
    fireEvent.click(screen.getByTestId(`change-exam-date-mini-calendar-day-${iso}`));
    await waitFor(() => expect(updateExamDate).toHaveBeenCalledWith(iso));

    // Learner navigates away (e.g. taps back) while the write is still in
    // flight — the screen unmounts before `updateExamDate` settles.
    unmount();
    resolveUpdate();

    // Flush the resolved microtask plus the full 600ms back-delay window —
    // long enough for a stray, untracked `setTimeout(router.back, 600)` to
    // have fired if the unmount guard were missing.
    await new Promise((resolve) => setTimeout(resolve, 700));

    expect(back).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
