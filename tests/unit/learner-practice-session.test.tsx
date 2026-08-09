import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `vi.hoisted` (not plain top-level `const`s) because `vi.mock` factories
// are hoisted above the rest of the module — see
// `tests/unit/learner-onboarding-exam-type.test.tsx`'s header comment for
// the TDZ rationale.
const { fetchLesenMock, fetchSprachbausteineMock, loadProgressMock, saveProgressMock, pushMock } =
  vi.hoisted(() => ({
    fetchLesenMock: vi.fn(),
    fetchSprachbausteineMock: vi.fn(),
    loadProgressMock: vi.fn(),
    saveProgressMock: vi.fn(),
    pushMock: vi.fn(),
  }));

vi.mock("@/learner/core/api/mockExam", () => ({
  fetchLesenPracticeSession: (...args: unknown[]) => fetchLesenMock(...args),
  fetchSprachbausteinePracticeSession: (...args: unknown[]) => fetchSprachbausteineMock(...args),
}));
vi.mock("@/learner/core/storage/practiceProgress", () => ({
  loadPracticeProgress: (...args: unknown[]) => loadProgressMock(...args),
  savePracticeProgress: (...args: unknown[]) => saveProgressMock(...args),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
}));
vi.mock("next-intl", () => ({ useLocale: () => "fr" }));

import { useLearnerSession } from "@/learner/core/auth/useLearnerSession";
import { useExamContextStore } from "@/learner/core/exam/examContext";
import { renderWithI18n } from "./helpers/renderWithI18n";
import { PracticeSessionScreen } from "@/learner/practice/screens/PracticeSessionScreen";

// Task 4.2 fixture shapes — `manifest`/`module` are SIBLING keys on the
// practice-get payload (lesen-practice-get / sprachbausteine-practice-get).
const manifest = {
  modelltest: { slug: "practice-b1-set-1", title: "Übungstest 1", short_label: "Ü1" },
  modules: [{ code: "LESEN", duration_minutes: 20, item_count: 2, instructions_de: "" }],
} as never;

const wireModule = {
  module_code: "LESEN",
  source_slug: "practice-b1-set-1",
  parts: [
    {
      teil_number: 1,
      teil_label: "Teil 1",
      part_kind: "GLOBALVERSTEHEN",
      duration_minutes: 10,
      instructions_de: "Lies den Text und beantworte die Fragen.",
      reading_texts: [{ slug: "t1", label: "Text 1", transcript_md: "Ein Beispieltext." }],
      questions: [
        {
          id: "i1",
          item_number: 1,
          stem_de: "Frage 1",
          answer_format: "MC_SINGLE_3",
          options: [
            { key: "a", text: "Antwort A" },
            { key: "b", text: "Antwort B" },
            { key: "c", text: "Antwort C" },
          ],
          correct_answer: "a",
          reading_text_slug: "t1",
        },
        {
          id: "i2",
          item_number: 2,
          stem_de: "Frage 2",
          answer_format: "MC_SINGLE_3",
          options: [
            { key: "a", text: "Antwort A" },
            { key: "b", text: "Antwort B" },
            { key: "c", text: "Antwort C" },
          ],
          correct_answer: "b",
          reading_text_slug: "t1",
        },
      ],
    },
  ],
} as never;

const readyPayload = {
  attemptId: null,
  examSlug: "practice-b1-set-1",
  manifest,
  module: wireModule,
};

describe("PracticeSessionScreen — first-pick locks, part views, recap", () => {
  beforeEach(() => {
    fetchLesenMock.mockReset();
    fetchSprachbausteineMock.mockReset();
    loadProgressMock.mockReset();
    saveProgressMock.mockReset();
    pushMock.mockReset();
    fetchLesenMock.mockResolvedValue(readyPayload);
    loadProgressMock.mockResolvedValue(null);
    saveProgressMock.mockResolvedValue(undefined);
    useLearnerSession.setState({
      status: "authenticated",
      session: { user: { id: "u1" } },
    } as never);
    useExamContextStore.setState({ board: "telc", level: "b1", isLoaded: true } as never);
  });
  afterEach(cleanup);

  it("(a) ready-state renders Teil chips + stem text", async () => {
    renderWithI18n(<PracticeSessionScreen modality="lesen" />);

    await waitFor(() =>
      expect(screen.getByTestId("practice-teil-chip-practice-b1-set-1-t1")).toBeInTheDocument()
    );
    // Literal FR `teilChip` string from fr/apprendre.json — non-tautological.
    expect(screen.getByTestId("practice-teil-chip-practice-b1-set-1-t1").textContent).toContain(
      "Teil 1"
    );
    expect(screen.getByText("Frage 1")).toBeInTheDocument();
    expect(fetchLesenMock).toHaveBeenCalledWith("B1", undefined);
  });

  it("(b) clicking practice-option-i1-b locks it and persists a camelCase record; re-clicking the correct-but-unpicked option does not change the reveal", async () => {
    renderWithI18n(<PracticeSessionScreen modality="lesen" />);
    await waitFor(() => expect(screen.getByTestId("practice-option-i1-b")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("practice-option-i1-b"));

    await waitFor(() =>
      expect(screen.getByTestId("practice-option-i1-b")).toHaveAttribute("data-locked", "true")
    );
    expect(screen.getByTestId("practice-option-i1-a")).toHaveAttribute("data-locked", "true");

    await waitFor(() => expect(saveProgressMock).toHaveBeenCalledTimes(1));
    const firstCall = saveProgressMock.mock.calls[0]![0];
    expect(firstCall).toMatchObject({
      userId: "u1",
      board: "telc",
      level: "B1",
      moduleCode: "LESEN",
      quizSlug: "practice-b1-set-1",
      answers: { i1: { key: "b", correct: false } },
      correctCount: 0,
      completedAt: null,
    });

    // i1's correct answer is "a" — re-picking it after the lock must be a
    // no-op (lockPick's same-ref guard): no extra persist call.
    fireEvent.click(screen.getByTestId("practice-option-i1-a"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(saveProgressMock).toHaveBeenCalledTimes(1);
  });

  it("(c) answering every item flips to practice-recap with the score line", async () => {
    renderWithI18n(<PracticeSessionScreen modality="lesen" />);
    await waitFor(() => expect(screen.getByTestId("practice-option-i1-b")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("practice-option-i1-b")); // i1 wrong (correct is "a")
    await waitFor(() => expect(saveProgressMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByTestId("practice-option-i2-b")); // i2 correct

    await waitFor(() => expect(screen.getByTestId("practice-recap")).toBeInTheDocument());
    // Literal FR `recapScore` string from fr/apprendre.json.
    expect(screen.getByTestId("practice-recap-score").textContent).toContain("1/2 bonnes réponses");
  });

  it("(d) restart clears the active part's locks and persists completedAt: null", async () => {
    renderWithI18n(<PracticeSessionScreen modality="lesen" />);
    await waitFor(() => expect(screen.getByTestId("practice-option-i1-b")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("practice-option-i1-b"));
    await waitFor(() => expect(saveProgressMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByTestId("practice-option-i2-b"));
    await waitFor(() => expect(screen.getByTestId("practice-recap")).toBeInTheDocument());

    const restartButton = screen.getByTestId("practice-recap-restart-practice-b1-set-1-t1");
    fireEvent.click(restartButton);

    await waitFor(() => expect(saveProgressMock).toHaveBeenCalledTimes(3));
    const lastCall = saveProgressMock.mock.calls[2]![0];
    expect(lastCall).toMatchObject({
      quizSlug: "practice-b1-set-1",
      answers: {},
      completedAt: null,
    });

    // Recap is gone; back on the (now-unlocked) session view.
    await waitFor(() => expect(screen.queryByTestId("practice-recap")).not.toBeInTheDocument());
    expect(screen.getByTestId("practice-option-i1-a")).not.toHaveAttribute("data-locked");
  });

  it("loading → error → retry re-fires the fetch", async () => {
    fetchLesenMock.mockReset();
    fetchLesenMock.mockRejectedValueOnce(new Error("offline"));
    fetchLesenMock.mockResolvedValueOnce(readyPayload);

    renderWithI18n(<PracticeSessionScreen modality="lesen" />);

    await waitFor(() => expect(screen.getByTestId("practice-session-error")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("practice-session-error-retry"));

    await waitFor(() => expect(fetchLesenMock).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByTestId("practice-session-error")).not.toBeInTheDocument()
    );
  });

  it("unsupported level renders the unsupported empty state without fetching", async () => {
    useExamContextStore.setState({ level: "c1" } as never);
    renderWithI18n(<PracticeSessionScreen modality="lesen" />);

    await waitFor(() =>
      expect(screen.getByTestId("practice-session-unsupported")).toBeInTheDocument()
    );
    expect(fetchLesenMock).not.toHaveBeenCalled();
  });

  it("act guard — the ready effect completes cleanly (no state update after unmount warnings)", async () => {
    const { unmount } = renderWithI18n(<PracticeSessionScreen modality="lesen" />);
    await waitFor(() => expect(screen.getByTestId("practice-option-i1-b")).toBeInTheDocument());
    act(() => {
      unmount();
    });
  });
});
