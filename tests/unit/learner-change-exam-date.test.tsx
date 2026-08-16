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

/**
 * An ISO date `days` ahead of today.
 *
 * `ChangeExamDateScreen` renders `MiniCalendar` without a `referenceDate`,
 * so the grid is anchored on the real clock and only ever paints 42 cells:
 * the visible (current) month plus enough leading/trailing days to fill
 * 6×7 (`buildMonthGrid`, `accueil/components/MiniCalendar.tsx`). Days
 * before today render `disabled`.
 *
 * That bounds how far ahead a test may click. The trailing overflow is at
 * minimum 5 days (worst case: a 31-day month whose 1st is a Sunday →
 * 6 leading + 31 = 37 cells used), so `today + 1` is inside the grid on
 * every date of every month, whereas a larger offset is only sometimes
 * there. This was `futureIso(21)`, which silently depended on the calendar
 * month: it was the very last cell of the grid on 2026-08-16 and fell off
 * the end on 2026-08-17, turning the whole file red overnight with no code
 * change. Keep this at 1 — the assertions only need *a* future, enabled
 * day, not a distant one.
 */
function futureIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Days ahead to click — see `futureIso`'s note on the 42-cell grid bound. */
const PICK_DAYS_AHEAD = 1;

describe("ChangeExamDateScreen", () => {
  it("saves the picked day then navigates back", async () => {
    updateExamDate.mockResolvedValue(undefined);
    ui();
    expect(screen.getByTestId("change-exam-date-title")).toBeInTheDocument();
    const iso = futureIso(PICK_DAYS_AHEAD);
    fireEvent.click(screen.getByTestId(`change-exam-date-mini-calendar-day-${iso}`));
    await waitFor(() => expect(updateExamDate).toHaveBeenCalledWith(iso));
    await waitFor(() => expect(back).toHaveBeenCalled(), { timeout: 2_000 });
  });

  it("surfaces the error caption and stays when the write fails", async () => {
    updateExamDate.mockRejectedValue(new Error("rls"));
    ui();
    fireEvent.click(
      screen.getByTestId(`change-exam-date-mini-calendar-day-${futureIso(PICK_DAYS_AHEAD)}`)
    );
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
    const iso = futureIso(PICK_DAYS_AHEAD);
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
