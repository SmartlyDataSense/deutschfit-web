import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `hydrateMock` is built via `vi.hoisted` (not a plain top-level `const`)
// because `vi.mock` factories are hoisted above the rest of the module —
// see `tests/unit/learner-onboarding-exam-type.test.tsx`'s header comment
// for the TDZ rationale.
const { fetchSetsMock, loadProgressMock, replaceMock, hydrateMock } = vi.hoisted(() => ({
  fetchSetsMock: vi.fn(),
  loadProgressMock: vi.fn(),
  replaceMock: vi.fn(),
  hydrateMock: vi.fn(),
}));

vi.mock("@/learner/core/api/mockExam", () => ({
  fetchPracticeSetsList: (...args: unknown[]) => fetchSetsMock(...args),
}));
vi.mock("@/learner/core/storage/practiceProgress", () => ({
  loadPracticeProgress: (...args: unknown[]) => loadProgressMock(...args),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: replaceMock }),
}));
vi.mock("next-intl", () => ({ useLocale: () => "fr" }));
// Partial mock: keep the real `useExamContextStore` (tests drive it
// directly via `setState`, same as `learner-practice-hub.test.tsx`) but
// stub `hydrateExamContext` so the hook's self-hydrate effect (fix round
// 1) doesn't hit real localStorage/Supabase in jsdom — tests control
// `isLoaded` transitions explicitly instead.
vi.mock("@/learner/core/exam/examContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/core/exam/examContext")>();
  return { ...actual, hydrateExamContext: hydrateMock };
});

import { useLearnerSession } from "@/learner/core/auth/useLearnerSession";
import { useExamContextStore } from "@/learner/core/exam/examContext";
import { renderWithI18n } from "./helpers/renderWithI18n";
import { PracticeSetPickerScreen } from "@/learner/practice/screens/PracticeSetPickerScreen";

describe("PracticeSetPickerScreen — set enumeration + single-set auto-forward", () => {
  beforeEach(() => {
    fetchSetsMock.mockReset();
    loadProgressMock.mockReset();
    replaceMock.mockReset();
    hydrateMock.mockReset();
    loadProgressMock.mockResolvedValue(null);
    useLearnerSession.setState({
      status: "authenticated",
      session: { user: { id: "u1" } },
    } as never);
    useExamContextStore.setState({ board: "telc", level: "b1", isLoaded: true } as never);
  });
  afterEach(cleanup);

  it("renders two sets as practice-set-<slug> cards with 1-based ordinals", async () => {
    fetchSetsMock.mockResolvedValue([
      { slug: "set-a", title: "Übungstest 01", shortLabel: null },
      { slug: "set-b", title: "Übungstest 02", shortLabel: null },
    ]);

    renderWithI18n(<PracticeSetPickerScreen modality="lesen" />);

    await waitFor(() => expect(screen.getByTestId("practice-set-set-a")).toBeInTheDocument());
    // Literal FR `setLabel` strings from fr/apprendre.json — non-tautological
    // (fails if ordinal wiring regresses to a constant or the wrong index).
    expect(screen.getByTestId("practice-set-set-a").textContent).toContain("Übungstest 1");
    expect(screen.getByTestId("practice-set-set-b").textContent).toContain("Übungstest 2");
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("auto-forwards the sole set via router.replace and renders skeletons meanwhile", async () => {
    fetchSetsMock.mockResolvedValue([
      { slug: "only-one", title: "Übungstest 01", shortLabel: null },
    ]);

    renderWithI18n(<PracticeSetPickerScreen modality="lesen" />);

    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith(
        "/fr/app/apprendre/practice/lesen/session?slug=only-one"
      )
    );
    expect(replaceMock).toHaveBeenCalledTimes(1);
    // Still skeletons, not the set-picker row chrome — the screen never
    // shows the single set as a tappable card.
    expect(screen.getByTestId("practice-set-picker-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("practice-set-only-one")).not.toBeInTheDocument();
  });

  it("surfaces a fetch rejection as the error title and reload refires the fetch", async () => {
    fetchSetsMock.mockRejectedValueOnce(new Error("offline"));
    fetchSetsMock.mockResolvedValueOnce([]);

    renderWithI18n(<PracticeSetPickerScreen modality="lesen" />);

    await waitFor(() =>
      expect(screen.getByTestId("practice-set-picker-error")).toBeInTheDocument()
    );
    // Literal FR `picker.errorTitle` string from fr/apprendre.json.
    expect(screen.getByTestId("practice-set-picker-error").textContent).toContain(
      "Impossible de charger les Übungstests"
    );

    fireEvent.click(screen.getByTestId("practice-set-picker-error-retry"));

    await waitFor(() => expect(fetchSetsMock).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByTestId("practice-set-picker-error")).not.toBeInTheDocument()
    );
  });

  it("fix round 1 — waits for exam-context hydration before fetching or auto-forwarding, then uses the hydrated board/level", async () => {
    fetchSetsMock.mockResolvedValue([
      { slug: "only-one", title: "Übungstest 01", shortLabel: null },
    ]);
    // Reproduces a hard refresh / deep-link straight onto this route: the
    // store still holds the un-hydrated defaults (`goethe`/`b1`), not the
    // learner's real track. `toPracticeLevel("b1")` is truthy, so before
    // this fix the hook would fetch (and could auto-forward) against this
    // wrong combo.
    useExamContextStore.setState({ board: "goethe", level: "b1", isLoaded: false } as never);

    renderWithI18n(<PracticeSetPickerScreen modality="lesen" />);

    await waitFor(() => expect(hydrateMock).toHaveBeenCalledTimes(1));
    // Give any (incorrect) fetch a chance to fire before asserting its
    // absence — `waitFor` above already flushed one microtask queue.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchSetsMock).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("practice-set-picker-loading")).toBeInTheDocument();

    // Hydration lands with the learner's REAL (different) track.
    act(() => {
      useExamContextStore.setState({ board: "telc", level: "b2", isLoaded: true } as never);
    });

    await waitFor(() => expect(fetchSetsMock).toHaveBeenCalledWith("B2", "LESEN"));
    await waitFor(() =>
      expect(loadProgressMock).toHaveBeenCalledWith(
        expect.objectContaining({ board: "telc", level: "B2", quizSlug: "only-one" })
      )
    );
    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith(
        "/fr/app/apprendre/practice/lesen/session?slug=only-one"
      )
    );
  });
});
