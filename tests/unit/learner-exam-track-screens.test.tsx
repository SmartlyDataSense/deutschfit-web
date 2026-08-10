/**
 * `ExamTrackScreen` + `ExamSelectorScreen` — S11 · Task 6.
 *
 * Covers the beta-gated track editor and its unrestricted selector twin:
 * hydration + one-shot seeding from the store, dirty-classification,
 * board-dominates-level modal variant selection, save success/failure
 * divergence (track keeps the modal open; selector closes it), and the
 * diagnostic-retake row.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const back = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back }),
}));
vi.mock("next-intl", () => ({ useLocale: () => "fr" }));

const setExamContext = vi.fn();
// Mutable mock state so individual tests can start from a NON-default
// baseline (telc/B2) or an unhydrated store — the tests that would have
// caught seeding-from-defaults bugs need this.
const examState = {
  board: "goethe",
  level: "b1",
  source: "onboarding",
  isLoaded: true,
  hydrate: vi.fn(),
  refreshFromServer: vi.fn(),
  setExamContext: (...a: unknown[]) => setExamContext(...a),
};
vi.mock("@/learner/core/exam/examContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/core/exam/examContext")>();
  return {
    ...actual,
    hydrateExamContext: vi.fn().mockResolvedValue(undefined),
    useExamContextStore: (selector?: (s: typeof examState) => unknown) =>
      selector ? selector(examState) : examState,
  };
});

import { initLearnerI18n } from "@/learner/core/i18n";
import { LearnerI18nProvider } from "@/learner/core/i18n/LearnerI18nProvider";
import { EXAM_BOARDS } from "@/learner/core/exam/examTypes";
import { hydrateExamContext } from "@/learner/core/exam/examContext";
import { ExamTrackScreen } from "@/learner/settings/screens/ExamTrackScreen";
import { ExamSelectorScreen } from "@/learner/settings/screens/ExamSelectorScreen";

afterEach(cleanup);
beforeAll(() => initLearnerI18n("fr"));
beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  examState.board = "goethe";
  examState.level = "b1";
  examState.source = "onboarding";
  examState.isLoaded = true;
});

// Board-blind test data: never hardcode a board key other than the
// fixture default — derive the "other" board from EXAM_BOARDS.
const OTHER_BOARD = EXAM_BOARDS.find((b) => b !== "goethe")!;

const track = () =>
  render(
    <LearnerI18nProvider lng="fr">
      <ExamTrackScreen />
    </LearnerI18nProvider>
  );
const selector = () =>
  render(
    <LearnerI18nProvider lng="fr">
      <ExamSelectorScreen />
    </LearnerI18nProvider>
  );

describe("ExamTrackScreen (S11.6)", () => {
  it("gates non-beta levels with the coming-soon caveat", () => {
    vi.stubEnv("NEXT_PUBLIC_BETA_LEVELS_ENABLED", "b1,b2");
    track();
    fireEvent.click(screen.getByTestId("settings-exam-level-trigger"));
    expect(screen.getByTestId("settings-exam-level-c1")).toBeDisabled();
    expect(screen.getAllByText("Bientôt disponible").length).toBeGreaterThan(0);
    expect(screen.getByTestId("settings-exam-level-b2")).not.toBeDisabled();
  });

  it("calls hydrateExamContext on mount", () => {
    track();
    expect(vi.mocked(hydrateExamContext)).toHaveBeenCalled();
  });

  it("save is disabled until dirty; picking a level enables it and opens the level-variant modal", async () => {
    setExamContext.mockResolvedValue(undefined);
    track();
    expect(screen.getByTestId("settings-exam-save")).toBeDisabled();
    fireEvent.click(screen.getByTestId("settings-exam-level-trigger"));
    fireEvent.click(screen.getByTestId("settings-exam-level-b2"));
    const save = screen.getByTestId("settings-exam-save");
    expect(save).not.toBeDisabled();
    fireEvent.click(save);
    expect(screen.getByTestId("settings-confirm-exam-change-modal")).toBeInTheDocument();
    expect(screen.getByText("Ajuster ton niveau ?")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("settings-confirm-exam-change-modal-confirm"));
    await waitFor(() =>
      expect(setExamContext).toHaveBeenCalledWith({ board: "goethe", level: "b2", source: "settings" })
    );
    await waitFor(() => expect(back).toHaveBeenCalled());
  });

  it("cancel closes the modal without saving and leaves the pending pick in place", () => {
    track();
    fireEvent.click(screen.getByTestId("settings-exam-level-trigger"));
    fireEvent.click(screen.getByTestId("settings-exam-level-b2"));
    fireEvent.click(screen.getByTestId("settings-exam-save"));
    expect(screen.getByTestId("settings-confirm-exam-change-modal")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("settings-confirm-exam-change-modal-cancel"));
    expect(screen.queryByTestId("settings-confirm-exam-change-modal")).toBeNull();
    expect(setExamContext).not.toHaveBeenCalled();
    expect(back).not.toHaveBeenCalled();
    // The pending pick (b2) survives the cancel — save stays enabled and
    // re-opening the modal shows the same level-variant title, not a
    // reset-to-clean state.
    expect(screen.getByTestId("settings-exam-save")).not.toBeDisabled();
    fireEvent.click(screen.getByTestId("settings-exam-level-trigger"));
    expect(screen.getByTestId("settings-exam-level-b2")).toHaveAttribute("aria-checked", "true");
  });

  it("board change dominates: board-variant title, and confirms with the picked board", async () => {
    setExamContext.mockResolvedValue(undefined);
    track();
    fireEvent.click(screen.getByTestId("settings-exam-board-trigger"));
    fireEvent.click(screen.getByTestId(`settings-exam-board-${OTHER_BOARD}`));
    fireEvent.click(screen.getByTestId("settings-exam-save"));
    expect(screen.getByText("Changer d'examen ?")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("settings-confirm-exam-change-modal-confirm"));
    await waitFor(() =>
      expect(setExamContext).toHaveBeenCalledWith({
        board: OTHER_BOARD,
        level: "b1",
        source: "settings",
      })
    );
  });

  it("seeds the baseline from the HYDRATED store — non-Goethe/B2 learner sees their own track, not goethe/b1", () => {
    // This is the regression test for the direct-load seeding bug: if the
    // editor seeded its useState from the unhydrated defaults, the save
    // button would be ENABLED here (goethe/b1 vs OTHER_BOARD/b2 = dirty)
    // and the board picker would show goethe.
    examState.board = OTHER_BOARD;
    examState.level = "b2";
    track();
    expect(screen.getByTestId("settings-exam-save")).toBeDisabled(); // not dirty vs the hydrated pair
    fireEvent.click(screen.getByTestId("settings-exam-board-trigger"));
    expect(screen.getByTestId(`settings-exam-board-${OTHER_BOARD}`)).toHaveAttribute(
      "aria-checked",
      "true"
    );
  });

  it("re-seeds across a REAL two-phase mount: unhydrated defaults, then hydration flips to a non-default pair", () => {
    // The prior "seeds from the HYDRATED store" test starts `isLoaded: true`
    // from the very first render, so `useState(ctxBoard)` already captures
    // the correct pair regardless of whether the seed effect exists — it
    // can't actually catch a missing/broken seed effect. This test models
    // the REAL mount sequence: first render happens while `isLoaded` is
    // still false (the unhydrated goethe/b1 defaults), THEN the store
    // flips to the learner's real (non-default) pair. Only the seed effect
    // can pull local state off the stale initial capture at that point.
    examState.isLoaded = false;
    examState.board = "goethe";
    examState.level = "b1";
    const { rerender } = track();
    expect(screen.getByTestId("settings-exam-loading")).toBeInTheDocument();

    examState.isLoaded = true;
    examState.board = OTHER_BOARD;
    examState.level = "b2";
    rerender(
      <LearnerI18nProvider lng="fr">
        <ExamTrackScreen />
      </LearnerI18nProvider>
    );

    expect(screen.getByTestId("settings-exam-save")).toBeDisabled();
    fireEvent.click(screen.getByTestId("settings-exam-board-trigger"));
    expect(screen.getByTestId(`settings-exam-board-${OTHER_BOARD}`)).toHaveAttribute(
      "aria-checked",
      "true"
    );
  });

  it("renders the loading gate (no pickers, no save) until the store hydrates", () => {
    examState.isLoaded = false;
    track();
    expect(screen.getByTestId("settings-exam-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("settings-exam-save")).toBeNull();
    expect(screen.queryByTestId("settings-exam-level-trigger")).toBeNull();
  });

  it("on save failure the modal STAYS OPEN and the error caption shows", async () => {
    setExamContext.mockRejectedValue(new Error("upsert failed"));
    track();
    fireEvent.click(screen.getByTestId("settings-exam-level-trigger"));
    fireEvent.click(screen.getByTestId("settings-exam-level-b2"));
    fireEvent.click(screen.getByTestId("settings-exam-save"));
    fireEvent.click(screen.getByTestId("settings-confirm-exam-change-modal-confirm"));
    await waitFor(() => expect(screen.getByTestId("settings-exam-save-error")).toBeInTheDocument());
    expect(screen.getByTestId("settings-confirm-exam-change-modal")).toBeInTheDocument();
    expect(back).not.toHaveBeenCalled();
  });

  it("retake row routes to the diagnostic in retake mode", () => {
    track();
    fireEvent.click(screen.getByTestId("settings-exam-retake-row"));
    expect(push).toHaveBeenCalledWith("/fr/app/onboarding/diagnostic?mode=retake");
  });
});

describe("ExamSelectorScreen (S11.6)", () => {
  it("offers all boards and ALL levels — no beta gate, no per-board filtering (mobile parity)", () => {
    vi.stubEnv("NEXT_PUBLIC_BETA_LEVELS_ENABLED", "b1");
    selector();
    fireEvent.click(screen.getByTestId("settings-exam-selector-board-trigger"));
    fireEvent.click(screen.getByTestId(`settings-exam-selector-board-${OTHER_BOARD}`));
    fireEvent.click(screen.getByTestId("settings-exam-selector-level-trigger"));
    // Mobile maps EXAM_LEVELS directly (ExamSelectorScreen.tsx:71) — even
    // c2 is offered and enabled; clamping happens inside setExamContext.
    expect(screen.getByTestId("settings-exam-selector-level-c2")).not.toBeDisabled();
  });

  it("calls hydrateExamContext on mount", () => {
    selector();
    expect(vi.mocked(hydrateExamContext)).toHaveBeenCalled();
  });

  it("seeds the baseline from the HYDRATED store — non-Goethe learner sees their own pair", () => {
    examState.board = OTHER_BOARD;
    examState.level = "b2";
    selector();
    expect(screen.getByTestId("settings-exam-selector-save")).toBeDisabled();
    fireEvent.click(screen.getByTestId("settings-exam-selector-board-trigger"));
    expect(screen.getByTestId(`settings-exam-selector-board-${OTHER_BOARD}`)).toHaveAttribute(
      "aria-checked",
      "true"
    );
  });

  it("re-seeds across a REAL two-phase mount: unhydrated defaults, then hydration flips to a non-default pair", () => {
    // Same rationale as ExamTrackScreen's equivalent test — a static
    // `isLoaded: true` from the first render can't distinguish "seed
    // effect present" from "seed effect missing".
    examState.isLoaded = false;
    examState.board = "goethe";
    examState.level = "b1";
    const { rerender } = selector();
    expect(screen.getByTestId("settings-exam-selector-loading")).toBeInTheDocument();

    examState.isLoaded = true;
    examState.board = OTHER_BOARD;
    examState.level = "b2";
    rerender(
      <LearnerI18nProvider lng="fr">
        <ExamSelectorScreen />
      </LearnerI18nProvider>
    );

    expect(screen.getByTestId("settings-exam-selector-save")).toBeDisabled();
    fireEvent.click(screen.getByTestId("settings-exam-selector-board-trigger"));
    expect(screen.getByTestId(`settings-exam-selector-board-${OTHER_BOARD}`)).toHaveAttribute(
      "aria-checked",
      "true"
    );
  });

  it("renders the loading gate until the store hydrates", () => {
    examState.isLoaded = false;
    selector();
    expect(screen.getByTestId("settings-exam-selector-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("settings-exam-selector-save")).toBeNull();
  });

  it("on save failure the modal CLOSES and the selector error caption shows", async () => {
    setExamContext.mockRejectedValue(new Error("upsert failed"));
    selector();
    fireEvent.click(screen.getByTestId("settings-exam-selector-level-trigger"));
    fireEvent.click(screen.getByTestId("settings-exam-selector-level-b2"));
    fireEvent.click(screen.getByTestId("settings-exam-selector-save"));
    fireEvent.click(screen.getByTestId("settings-exam-selector-confirm-modal-confirm"));
    await waitFor(() =>
      expect(screen.getByTestId("settings-exam-selector-save-error")).toBeInTheDocument()
    );
    expect(screen.queryByTestId("settings-exam-selector-confirm-modal")).toBeNull();
  });

  it("does not offer a retake row (unrestricted selector has no diagnostic shortcut)", () => {
    selector();
    expect(screen.queryByTestId("settings-exam-retake-row")).toBeNull();
  });
});
