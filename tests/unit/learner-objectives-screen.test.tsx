/**
 * `ObjectivesScreen` — S11 · Task 7.
 *
 * Covers hydration (round-trip pre-select from a stored row, null-row
 * fallback to other/10, load-failure caption), the numericToSchedule
 * exact-match contract, dirty-gated save with the exact upsert payload,
 * navigate-back on success, and stay-put-with-caption on failure.
 */
import { StrictMode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const back = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back }),
}));
vi.mock("next-intl", () => ({ useLocale: () => "fr" }));

const readUserObjectives = vi.fn();
const updateUserObjectives = vi.fn();
vi.mock("@/learner/settings/services/userObjectives", () => ({
  readUserObjectives: (...a: unknown[]) => readUserObjectives(...a),
  updateUserObjectives: (...a: unknown[]) => updateUserObjectives(...a),
}));

import { initLearnerI18n } from "@/learner/core/i18n";
import { LearnerI18nProvider } from "@/learner/core/i18n/LearnerI18nProvider";
import { ObjectivesScreen, numericToSchedule } from "@/learner/settings/screens/ObjectivesScreen";
import frOnboarding from "@/learner/locales/fr/onboarding.json";

afterEach(cleanup);
beforeAll(() => initLearnerI18n("fr"));
beforeEach(() => {
  vi.clearAllMocks();
});

const ui = () =>
  render(
    <LearnerI18nProvider lng="fr">
      <ObjectivesScreen />
    </LearnerI18nProvider>
  );

async function waitHydrated() {
  await waitFor(() =>
    expect(screen.getByTestId("settings-objectives-motivation")).toBeInTheDocument()
  );
}

describe("numericToSchedule (S11.7)", () => {
  it("exact-matches a known bucket", () => {
    expect(numericToSchedule(30)).toBe("30");
  });

  it("returns null for an unmatched number — no nearest-match clamping", () => {
    // 15 sits between the 10 and 20 buckets. A nearest-match
    // implementation would round this to "10" or "20"; the ruling
    // (mobile ObjectivesScreen.tsx:74-80) is exact-match only.
    expect(numericToSchedule(15)).toBeNull();
  });

  it("returns null for a null input", () => {
    expect(numericToSchedule(null)).toBeNull();
  });
});

describe("ObjectivesScreen (S11.7)", () => {
  it("hydrates from user_objectives and pre-selects the stored values (round trip)", async () => {
    readUserObjectives.mockResolvedValue({ motivation: "work", dailyMinutes: 20 });
    ui();
    expect(screen.getByTestId("settings-objectives-loading")).toBeInTheDocument();
    await waitHydrated();
    expect(screen.getByTestId("settings-objectives-save")).toBeDisabled(); // not dirty yet

    // Pin the actual pre-selection, not just presence of the row: open
    // each picker and assert the stored value is the checked option.
    fireEvent.click(screen.getByTestId("settings-objectives-motivation-trigger"));
    expect(screen.getByTestId("settings-objectives-motivation-work")).toHaveAttribute(
      "aria-checked",
      "true"
    );
    fireEvent.click(screen.getByTestId("settings-objectives-motivation-work")); // close

    fireEvent.click(screen.getByTestId("settings-objectives-schedule-trigger"));
    expect(screen.getByTestId("settings-objectives-schedule-20")).toHaveAttribute(
      "aria-checked",
      "true"
    );
  });

  it("falls back to other/10 for a null row — no load-error caption, hydrated with defaults", async () => {
    readUserObjectives.mockResolvedValue(null);
    ui();
    await waitHydrated();
    expect(screen.queryByTestId("settings-objectives-load-error")).toBeNull();

    fireEvent.click(screen.getByTestId("settings-objectives-motivation-trigger"));
    expect(screen.getByTestId("settings-objectives-motivation-other")).toHaveAttribute(
      "aria-checked",
      "true"
    );
    fireEvent.click(screen.getByTestId("settings-objectives-motivation-other"));

    fireEvent.click(screen.getByTestId("settings-objectives-schedule-trigger"));
    expect(screen.getByTestId("settings-objectives-schedule-10")).toHaveAttribute(
      "aria-checked",
      "true"
    );
  });

  // I-2 review fix: `SettingsPickerRow`'s option buttons must use the
  // registered `--radius-sm` token, not Tailwind's bare `rounded-xl`
  // built-in (deliberately unregistered under `@theme` — see
  // `globals.css:57-63` — so any bare `rounded-*` utility here is
  // off-token). Precedent: `ExamTypeScreen.tsx`'s `DropdownOption` uses
  // `rounded-[var(--radius-sm)]`.
  it("schedule picker option rows use the --radius-sm token, not a bare Tailwind radius (I-2)", async () => {
    readUserObjectives.mockResolvedValue({ motivation: "work", dailyMinutes: 20 });
    ui();
    await waitHydrated();
    fireEvent.click(screen.getByTestId("settings-objectives-schedule-trigger"));
    const option = screen.getByTestId("settings-objectives-schedule-60");
    expect(option.className).toContain("rounded-[var(--radius-sm)]");
    // Bare Tailwind radius utility (e.g. `rounded-xl`) is a distinct
    // substring from `rounded-[var(--radius-sm)]` — this only matches a
    // stray off-token class, not the token usage just asserted above.
    expect(option.className).not.toMatch(/\brounded-(sm|md|lg|xl|2xl|3xl)\b/);
  });

  // T7 (final-review fold-in): pin the "intensif" caveat to the "60"
  // bucket SPECIFICALLY, not just "some option has a caveat" — moving the
  // `value === "60"` check in the screen to `value === "45"` left the
  // suite green before this test existed.
  it("only the 60-minute schedule option carries the intensif caveat (T7)", async () => {
    readUserObjectives.mockResolvedValue({ motivation: "work", dailyMinutes: 20 });
    ui();
    await waitHydrated();
    fireEvent.click(screen.getByTestId("settings-objectives-schedule-trigger"));
    expect(screen.getByTestId("settings-objectives-schedule-60")).toHaveTextContent(
      frOnboarding.schedule.caveat.intensif
    );
    expect(screen.getByTestId("settings-objectives-schedule-45")).not.toHaveTextContent(
      frOnboarding.schedule.caveat.intensif
    );
  });

  it("an unmatched stored daily_minutes value falls back to the 10-minute bucket", async () => {
    // dailyMinutes: 15 has no exact SCHEDULES match, so numericToSchedule
    // returns null and the screen must fall back to "10" — exercises the
    // fallback path end-to-end through the render, not just the unit fn.
    readUserObjectives.mockResolvedValue({ motivation: "travel", dailyMinutes: 15 });
    ui();
    await waitHydrated();
    fireEvent.click(screen.getByTestId("settings-objectives-schedule-trigger"));
    expect(screen.getByTestId("settings-objectives-schedule-10")).toHaveAttribute(
      "aria-checked",
      "true"
    );
  });

  it("falls back to other/10 and shows the load-error caption on failure", async () => {
    readUserObjectives.mockRejectedValue(new Error("nope"));
    ui();
    await waitFor(() =>
      expect(screen.getByTestId("settings-objectives-load-error")).toBeInTheDocument()
    );
    await waitHydrated();
    expect(screen.getByTestId("settings-objectives-save")).toBeDisabled();
  });

  it("save stays disabled while unhydrated even though nothing has changed yet", () => {
    readUserObjectives.mockResolvedValue({ motivation: "work", dailyMinutes: 20 });
    ui();
    // Before hydration resolves, the picker rows (and the save button)
    // aren't rendered at all — only the loading placeholder is.
    expect(screen.queryByTestId("settings-objectives-save")).toBeNull();
    expect(screen.getByTestId("settings-objectives-loading")).toBeInTheDocument();
  });

  it("saves the changed pair with the exact payload then navigates back", async () => {
    readUserObjectives.mockResolvedValue({ motivation: "work", dailyMinutes: 20 });
    updateUserObjectives.mockResolvedValue(undefined);
    ui();
    await waitHydrated();
    fireEvent.click(screen.getByTestId("settings-objectives-schedule-trigger"));
    fireEvent.click(screen.getByTestId("settings-objectives-schedule-30"));
    const save = screen.getByTestId("settings-objectives-save");
    expect(save).not.toBeDisabled();
    fireEvent.click(save);
    await waitFor(() =>
      expect(updateUserObjectives).toHaveBeenCalledWith({ motivation: "work", schedule: "30" })
    );
    // Exactly this pair — no extra keys leaking through (e.g. no stray
    // `dailyMinutes` or third field slipping into the upsert call).
    expect(updateUserObjectives).toHaveBeenCalledTimes(1);
    const call = updateUserObjectives.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(Object.keys(call ?? {})).toEqual(["motivation", "schedule"]);
    await waitFor(() => expect(back).toHaveBeenCalled());
  });

  // I-1 review fix: a stored row with no matching schedule bucket (e.g.
  // `daily_minutes: null`, or a non-bucket value that `numericToSchedule`
  // can't map) leaves `schedule` state at null after hydration. Editing
  // ONLY motivation must save that null through untouched — not fabricate
  // the "10"-minute bucket the learner never picked. Mutating the screen's
  // `handleSave` back to `schedule: schedule ?? "10"` makes this go red
  // (asserts `schedule: null`, would receive `schedule: "10"`).
  it("saving with an unset schedule persists null, not the 10-minute bucket (I-1)", async () => {
    readUserObjectives.mockResolvedValue({ motivation: "travel", dailyMinutes: null });
    updateUserObjectives.mockResolvedValue(undefined);
    ui();
    await waitHydrated();
    fireEvent.click(screen.getByTestId("settings-objectives-motivation-trigger"));
    fireEvent.click(screen.getByTestId("settings-objectives-motivation-work"));
    const save = screen.getByTestId("settings-objectives-save");
    expect(save).not.toBeDisabled();
    fireEvent.click(save);
    await waitFor(() =>
      expect(updateUserObjectives).toHaveBeenCalledWith({ motivation: "work", schedule: null })
    );
  });

  // I-1 residual coverage gap (re-review): the mirror image of the test
  // above. A stored row with `motivation: null` (no row yet, or a row
  // written before motivation was captured) leaves `motivation` state at
  // null after hydration. Editing ONLY the schedule must save that null
  // through untouched — not fabricate "other" the learner never picked.
  // Mutating the screen's `handleSave` back to
  // `motivation: motivation ?? "other"` makes this go red (asserts
  // `motivation: null`, would receive `motivation: "other"`).
  it("saving with an unset motivation persists null, not the 'other' fallback (I-1)", async () => {
    readUserObjectives.mockResolvedValue({ motivation: null, dailyMinutes: 20 });
    updateUserObjectives.mockResolvedValue(undefined);
    ui();
    await waitHydrated();
    fireEvent.click(screen.getByTestId("settings-objectives-schedule-trigger"));
    fireEvent.click(screen.getByTestId("settings-objectives-schedule-30"));
    const save = screen.getByTestId("settings-objectives-save");
    expect(save).not.toBeDisabled();
    fireEvent.click(save);
    await waitFor(() =>
      expect(updateUserObjectives).toHaveBeenCalledWith({ motivation: null, schedule: "30" })
    );
  });

  it("changing only motivation (schedule untouched) still saves the unchanged schedule value", async () => {
    readUserObjectives.mockResolvedValue({ motivation: "work", dailyMinutes: 20 });
    updateUserObjectives.mockResolvedValue(undefined);
    ui();
    await waitHydrated();
    fireEvent.click(screen.getByTestId("settings-objectives-motivation-trigger"));
    fireEvent.click(screen.getByTestId("settings-objectives-motivation-travel"));
    fireEvent.click(screen.getByTestId("settings-objectives-save"));
    await waitFor(() =>
      expect(updateUserObjectives).toHaveBeenCalledWith({ motivation: "travel", schedule: "20" })
    );
  });

  it("save failure shows the caption and does not navigate", async () => {
    readUserObjectives.mockResolvedValue({ motivation: "work", dailyMinutes: 20 });
    updateUserObjectives.mockRejectedValue(new Error("rls"));
    ui();
    await waitHydrated();
    fireEvent.click(screen.getByTestId("settings-objectives-schedule-trigger"));
    fireEvent.click(screen.getByTestId("settings-objectives-schedule-30"));
    fireEvent.click(screen.getByTestId("settings-objectives-save"));
    await waitFor(() =>
      expect(screen.getByTestId("settings-objectives-save-error")).toBeInTheDocument()
    );
    expect(back).not.toHaveBeenCalled();
    // Screen stays put with the picked value retained, not reset.
    fireEvent.click(screen.getByTestId("settings-objectives-schedule-trigger"));
    expect(screen.getByTestId("settings-objectives-schedule-30")).toHaveAttribute(
      "aria-checked",
      "true"
    );
  });

  it("StrictMode double-invoke: a stale first-pass read must not clobber the second pass's fresher data", async () => {
    // React 18 StrictMode mounts effects twice per commit (mount → cleanup
    // → mount) for the SAME component instance — this is exactly what the
    // `let cancelled` guard (web#38) protects against, not just a plain
    // unmount. Two `readUserObjectives()` calls fire; if the stale first
    // call resolves AFTER the second and its `if (cancelled) return;` guard
    // is missing, its (now outdated) data silently overwrites the correct
    // hydrated state written by the second pass.
    let resolveFirst!: (v: { motivation: string; dailyMinutes: number }) => void;
    let resolveSecond!: (v: { motivation: string; dailyMinutes: number }) => void;
    readUserObjectives
      .mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)))
      .mockReturnValueOnce(new Promise((resolve) => (resolveSecond = resolve)));

    render(
      <StrictMode>
        <LearnerI18nProvider lng="fr">
          <ObjectivesScreen />
        </LearnerI18nProvider>
      </StrictMode>
    );
    expect(readUserObjectives).toHaveBeenCalledTimes(2);

    // Resolve the SECOND (live) pass's read first with the correct data...
    resolveSecond({ motivation: "work", dailyMinutes: 20 });
    await waitHydrated();
    // ...then resolve the FIRST (stale, cleaned-up) pass's read afterwards.
    resolveFirst({ motivation: "travel", dailyMinutes: 5 });
    await Promise.resolve();

    fireEvent.click(screen.getByTestId("settings-objectives-motivation-trigger"));
    expect(screen.getByTestId("settings-objectives-motivation-work")).toHaveAttribute(
      "aria-checked",
      "true"
    );
  });
});
