import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `vi.hoisted` (not plain top-level `const`s) because `vi.mock` factories
// are hoisted above the rest of the module — see
// `tests/unit/learner-onboarding-exam-type.test.tsx`'s header comment for
// the TDZ rationale.
const {
  fetchLesenMock,
  fetchSprachbausteineMock,
  loadProgressMock,
  saveProgressMock,
  pushMock,
  hydrateMock,
} = vi.hoisted(() => ({
  fetchLesenMock: vi.fn(),
  fetchSprachbausteineMock: vi.fn(),
  loadProgressMock: vi.fn(),
  saveProgressMock: vi.fn(),
  pushMock: vi.fn(),
  hydrateMock: vi.fn(),
}));

vi.mock("@/learner/core/api/examApi", () => ({
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
// Partial mock: keep the real `useExamContextStore` (tests drive it
// directly via `setState`, same as `learner-practice-hub.test.tsx` /
// `learner-practice-picker.test.tsx`) but stub `hydrateExamContext` so the
// hook's self-hydrate effect (fix round 1) doesn't hit real
// localStorage/Supabase in jsdom — tests control `isLoaded` transitions
// explicitly instead.
vi.mock("@/learner/core/exam/examContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/core/exam/examContext")>();
  return { ...actual, hydrateExamContext: hydrateMock };
});

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

// Fix round 1 (IMPORTANT 2) — CLOZE fixture. Two Teile in the SAME
// SPRACHBAUSTEINE module: Teil 1 items use CLOZE_DRAG (consume-mode
// shared bank), Teil 2 items use CLOZE_RADIO (reuse-mode fixed options).
// Both Teile share the SAME option keys/texts so the consume-vs-reuse
// difference is directly observable in the DOM (§6.2 answerFormat values
// from `core/exam/engine/loadModel.ts`'s `KNOWN_ANSWER_FORMATS`).
const clozeManifest = {
  modelltest: { slug: "practice-cloze-set-1", title: "Übungstest Cloze", short_label: "ÜC" },
  modules: [{ code: "SPRACHBAUSTEINE", duration_minutes: 15, item_count: 4, instructions_de: "" }],
} as never;

const clozeWireModule = {
  module_code: "SPRACHBAUSTEINE",
  source_slug: "practice-cloze-set-1",
  parts: [
    {
      teil_number: 1,
      teil_label: "Teil 1",
      part_kind: "SPRACHBAUSTEINE_DRAG",
      duration_minutes: 8,
      instructions_de: "Wähle die richtige Lösung.",
      reading_texts: [
        { slug: "ct1", label: "Text 1", transcript_md: "Ich {{1}} gern Deutsch und {{2}} Musik." },
      ],
      questions: [
        {
          id: "c1",
          item_number: 1,
          stem_de: null,
          answer_format: "CLOZE_DRAG",
          options: [
            { key: "a", text: "lerne" },
            { key: "b", text: "höre" },
            { key: "c", text: "koche" },
          ],
          correct_answer: "a",
          reading_text_slug: "ct1",
        },
        {
          id: "c2",
          item_number: 2,
          stem_de: null,
          answer_format: "CLOZE_DRAG",
          options: [
            { key: "a", text: "lerne" },
            { key: "b", text: "höre" },
            { key: "c", text: "koche" },
          ],
          correct_answer: "b",
          reading_text_slug: "ct1",
        },
      ],
    },
    {
      teil_number: 2,
      teil_label: "Teil 2",
      part_kind: "SPRACHBAUSTEINE_RADIO",
      duration_minutes: 7,
      instructions_de: "Wähle die richtige Lösung.",
      reading_texts: [
        { slug: "ct2", label: "Text 2", transcript_md: "Er {{1}} Fußball und sie {{2}} Klavier." },
      ],
      questions: [
        {
          id: "c3",
          item_number: 1,
          stem_de: null,
          answer_format: "CLOZE_RADIO",
          options: [
            { key: "a", text: "spielt" },
            { key: "b", text: "hört" },
            { key: "c", text: "malt" },
          ],
          correct_answer: "a",
          reading_text_slug: "ct2",
        },
        {
          id: "c4",
          item_number: 2,
          stem_de: null,
          answer_format: "CLOZE_RADIO",
          options: [
            { key: "a", text: "spielt" },
            { key: "b", text: "hört" },
            { key: "c", text: "malt" },
          ],
          correct_answer: "b",
          reading_text_slug: "ct2",
        },
      ],
    },
  ],
} as never;

const clozeReadyPayload = {
  attemptId: null,
  examSlug: "practice-cloze-set-1",
  manifest: clozeManifest,
  module: clozeWireModule,
};

describe("PracticeSessionScreen — first-pick locks, part views, recap", () => {
  beforeEach(() => {
    fetchLesenMock.mockReset();
    fetchSprachbausteineMock.mockReset();
    loadProgressMock.mockReset();
    saveProgressMock.mockReset();
    pushMock.mockReset();
    hydrateMock.mockReset();
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

  it("fix round 1 — waits for exam-context hydration before fetching, then fetches with the hydrated board/level", async () => {
    // Reproduces a hard refresh / deep-link straight onto the session
    // route: the store still holds the un-hydrated defaults, not the
    // learner's real track. `toPracticeLevel("b1")` is truthy, so before
    // this fix the hook would fetch against this wrong combo.
    useExamContextStore.setState({ board: "goethe", level: "b1", isLoaded: false } as never);

    renderWithI18n(<PracticeSessionScreen modality="lesen" />);

    await waitFor(() => expect(hydrateMock).toHaveBeenCalledTimes(1));
    // Give any (incorrect) fetch a chance to fire before asserting its
    // absence — `waitFor` above already flushed one microtask queue.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchLesenMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("practice-session-loading")).toBeInTheDocument();

    // Hydration lands with the learner's REAL (different) track.
    act(() => {
      useExamContextStore.setState({ board: "telc", level: "b2", isLoaded: true } as never);
    });

    await waitFor(() => expect(fetchLesenMock).toHaveBeenCalledWith("B2", undefined));
  });
});

describe("PracticeSessionScreen — ClozePartView coverage (fix round 1, IMPORTANT 2)", () => {
  beforeEach(() => {
    fetchLesenMock.mockReset();
    fetchSprachbausteineMock.mockReset();
    loadProgressMock.mockReset();
    saveProgressMock.mockReset();
    pushMock.mockReset();
    hydrateMock.mockReset();
    fetchSprachbausteineMock.mockResolvedValue(clozeReadyPayload);
    loadProgressMock.mockResolvedValue(null);
    saveProgressMock.mockResolvedValue(undefined);
    useLearnerSession.setState({
      status: "authenticated",
      session: { user: { id: "u1" } },
    } as never);
    useExamContextStore.setState({ board: "telc", level: "b1", isLoaded: true } as never);
  });
  afterEach(cleanup);

  it("(a) a CLOZE-format part renders via ClozePartView with gap tokens parsed", async () => {
    renderWithI18n(<PracticeSessionScreen modality="sprachbausteine" />);

    await waitFor(() => expect(screen.getByTestId("practice-cloze-text")).toBeInTheDocument());
    // Non-tautological: asserts the actual parsed segments, not just
    // presence of the container — the surrounding text AND both unlocked
    // gap placeholders ("(n) ____", ClozePartView's own format) must be
    // in the DOM, proving `{{1}}`/`{{2}}` were split out as gaps rather
    // than rendered as literal text.
    const text = screen.getByTestId("practice-cloze-text").textContent ?? "";
    expect(text).toContain("Ich");
    expect(text).toContain("gern Deutsch und");
    expect(text).toContain("Musik.");
    expect(screen.getByTestId("practice-gap-c1")).toHaveTextContent("(1) ____");
    expect(screen.getByTestId("practice-gap-c2")).toHaveTextContent("(2) ____");
    expect(screen.getByTestId("practice-gap-c1")).not.toHaveAttribute("data-locked");
  });

  it("(b) picking a gap locks it, and CLOZE_DRAG (consume) vs CLOZE_RADIO (reuse) differ observably in the sibling's option list", async () => {
    renderWithI18n(<PracticeSessionScreen modality="sprachbausteine" />);
    await waitFor(() => expect(screen.getByTestId("practice-gap-c1")).toBeInTheDocument());

    // --- Teil 1, CLOZE_DRAG: picking c1="b" must CONSUME "b" out of c2's pool.
    fireEvent.click(screen.getByTestId("practice-gap-c1"));
    await waitFor(() => expect(screen.getByTestId("practice-option-c1-b")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("practice-option-c1-b"));

    await waitFor(() =>
      expect(screen.getByTestId("practice-gap-c1")).toHaveAttribute("data-locked", "true")
    );
    // Picker closes after the first pick (first-pick-lock semantics).
    expect(screen.queryByTestId("practice-picker-c1")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("practice-gap-c2"));
    await waitFor(() => expect(screen.getByTestId("practice-option-c2-b")).toBeInTheDocument());
    // Observable DOM difference: "b" is disabled + struck-through on c2's
    // pool because c1 (a sibling in the SAME consume-mode part) already
    // holds it — `buildOptionPool`'s `consumedByOther`.
    expect(screen.getByTestId("practice-option-c2-b")).toBeDisabled();
    expect(screen.getByTestId("practice-option-c2-b").className).toContain("line-through");
    expect(screen.getByTestId("practice-option-c2-a")).not.toBeDisabled();

    fireEvent.click(screen.getByTestId("practice-option-c2-a"));
    await waitFor(() =>
      expect(screen.getByTestId("practice-gap-c2")).toHaveAttribute("data-locked", "true")
    );

    // --- Teil 2, CLOZE_RADIO: same shared option keys, but REUSE mode —
    // nothing is ever consumed regardless of sibling picks.
    fireEvent.click(screen.getByTestId("practice-teil-chip-practice-cloze-set-1-t2"));
    await waitFor(() => expect(screen.getByTestId("practice-gap-c3")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("practice-gap-c3"));
    await waitFor(() => expect(screen.getByTestId("practice-option-c3-b")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("practice-option-c3-b"));
    await waitFor(() =>
      expect(screen.getByTestId("practice-gap-c3")).toHaveAttribute("data-locked", "true")
    );

    fireEvent.click(screen.getByTestId("practice-gap-c4"));
    await waitFor(() => expect(screen.getByTestId("practice-option-c4-b")).toBeInTheDocument());
    // KEPT — unlike the CLOZE_DRAG case above, "b" stays enabled here even
    // though sibling c3 already picked it: reuse mode never consumes.
    expect(screen.getByTestId("practice-option-c4-b")).not.toBeDisabled();
    expect(screen.getByTestId("practice-option-c4-b").className).not.toContain("line-through");
  });

  it("(c) a locked cloze gap ignores further picks", async () => {
    renderWithI18n(<PracticeSessionScreen modality="sprachbausteine" />);
    await waitFor(() => expect(screen.getByTestId("practice-gap-c1")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("practice-gap-c1"));
    await waitFor(() => expect(screen.getByTestId("practice-option-c1-a")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("practice-option-c1-a"));

    await waitFor(() =>
      expect(screen.getByTestId("practice-gap-c1")).toHaveAttribute("data-locked", "true")
    );
    await waitFor(() => expect(saveProgressMock).toHaveBeenCalledTimes(1));

    // Locked gap is a disabled <button> (ClozePartView: `disabled={locked
    // || !item}`) — clicking it again must not reopen the picker or fire
    // another pick/persist.
    expect(screen.getByTestId("practice-gap-c1")).toBeDisabled();
    fireEvent.click(screen.getByTestId("practice-gap-c1"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryByTestId("practice-picker-c1")).not.toBeInTheDocument();
    expect(saveProgressMock).toHaveBeenCalledTimes(1);
    // Reveal stays the correct-pick styling — a no-op re-click didn't
    // flip it to some other state.
    expect(screen.getByTestId("practice-gap-c1")).toHaveTextContent("lerne");
  });
});
