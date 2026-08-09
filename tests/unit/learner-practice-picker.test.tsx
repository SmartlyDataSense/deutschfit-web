import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fetchSetsMock, loadProgressMock, replaceMock } = vi.hoisted(() => ({
  fetchSetsMock: vi.fn(),
  loadProgressMock: vi.fn(),
  replaceMock: vi.fn(),
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

import { useLearnerSession } from "@/learner/core/auth/useLearnerSession";
import { useExamContextStore } from "@/learner/core/exam/examContext";
import { renderWithI18n } from "./helpers/renderWithI18n";
import { PracticeSetPickerScreen } from "@/learner/practice/screens/PracticeSetPickerScreen";

describe("PracticeSetPickerScreen — set enumeration + single-set auto-forward", () => {
  beforeEach(() => {
    fetchSetsMock.mockReset();
    loadProgressMock.mockReset();
    replaceMock.mockReset();
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
});
