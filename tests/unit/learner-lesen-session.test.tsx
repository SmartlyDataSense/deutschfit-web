import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `vi.hoisted` — `vi.mock` factories are hoisted above the rest of the
// module, so any mock fn they reference must be built via `vi.hoisted`, not
// a plain top-level `const` (same TDZ rationale as `learner-lesen-intro.test.tsx`).
const {
  fetchLesenSessionMock,
  submitLesenMock,
  advanceSessionMock,
  finalizeSessionMock,
  trackEventMock,
  pushMock,
  replaceMock,
  backMock,
} = vi.hoisted(() => ({
  fetchLesenSessionMock: vi.fn(),
  submitLesenMock: vi.fn(),
  advanceSessionMock: vi.fn(),
  finalizeSessionMock: vi.fn(),
  trackEventMock: vi.fn(),
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
  backMock: vi.fn(),
}));

// Partial mock: keep the real `normaliseReport` (pure — no reason to fake
// it) but stub `fetchLesenSession`, same idiom as `examContext`'s partial
// mock in `learner-lesen-intro.test.tsx`.
vi.mock("@/learner/core/api/mockExam", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/core/api/mockExam")>();
  return {
    ...actual,
    fetchLesenSession: (...args: unknown[]) => fetchLesenSessionMock(...args),
  };
});
vi.mock("@/learner/core/api/examApi", () => ({
  submitLesen: (...args: unknown[]) => submitLesenMock(...args),
}));
vi.mock("@/learner/core/exam/mockExamSession", () => ({
  advanceSession: (...args: unknown[]) => advanceSessionMock(...args),
  finalizeSession: (...args: unknown[]) => finalizeSessionMock(...args),
}));
vi.mock("@/learner/core/analytics/posthog", () => ({
  trackEvent: (...args: unknown[]) => trackEventMock(...args),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock, back: backMock }),
}));
vi.mock("next-intl", () => ({ useLocale: () => "fr" }));

import { useLearnerSession } from "@/learner/core/auth/useLearnerSession";
import { LesenResultsScreen } from "@/learner/lesen/screens/LesenResultsScreen";
import { LesenSessionScreen } from "@/learner/lesen/screens/LesenSessionScreen";
import { useLesenResultsStore } from "@/learner/lesen/resultsStore";
import { renderWithI18n } from "./helpers/renderWithI18n";

// Task 4.2 fixture shapes — `manifest`/`module` are SIBLING keys on the
// `lesen-start`/`lesen-session-get` payload, same convention as
// `learner-practice-session.test.tsx`. Two items in one Teil so the
// submit-flow tests can drive "answer both items → submit" end to end.
const manifest = {
  modelltest: { slug: "b1-01", title: "Modelltest 1", short_label: "MT 1" },
  modules: [{ code: "LESEN", duration_minutes: 20, item_count: 2, instructions_de: "" }],
} as never;

const wireModule = {
  module_code: "LESEN",
  source_slug: "b1-01",
  parts: [
    {
      teil_number: 1,
      teil_label: "Teil 1",
      part_kind: "GLOBALVERSTEHEN",
      duration_minutes: 20,
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
  attemptId: "lesen-1",
  examSlug: "b1-01",
  manifest,
  module: wireModule,
};

async function goToLastItem(): Promise<void> {
  await waitFor(() => expect(screen.getByTestId("lesen-option-a")).toBeInTheDocument());
  fireEvent.click(screen.getByTestId("lesen-option-a")); // item 1
  fireEvent.click(screen.getByTestId("lesen-session-next"));
  await waitFor(() => expect(screen.getByTestId("lesen-session-submit")).toBeInTheDocument());
  fireEvent.click(screen.getByTestId("lesen-option-b")); // item 2
}

describe("LesenSessionScreen — live drill submit flow", () => {
  beforeEach(() => {
    fetchLesenSessionMock.mockReset();
    submitLesenMock.mockReset();
    advanceSessionMock.mockReset();
    finalizeSessionMock.mockReset();
    trackEventMock.mockReset();
    pushMock.mockReset();
    replaceMock.mockReset();
    backMock.mockReset();
    fetchLesenSessionMock.mockResolvedValue(readyPayload);
    useLearnerSession.setState({
      status: "authenticated",
      session: { user: { id: "u1" } },
    } as never);
    useLesenResultsStore.getState().clear();
  });
  afterEach(cleanup);

  it("(a) fires exam_module_started exactly once with resumed: true when the route carried attemptId", async () => {
    renderWithI18n(
      <LesenSessionScreen attemptId="lesen-1" mockAttemptId="mock-1" moduleFilter="LESEN" />
    );

    await waitFor(() =>
      expect(screen.getByTestId("lesen-session-option-list")).toBeInTheDocument()
    );

    const startedCalls = trackEventMock.mock.calls.filter((c) => c[0] === "exam_module_started");
    expect(startedCalls).toHaveLength(1);
    expect(startedCalls[0]?.[1]).toEqual({
      attempt_id: "lesen-1",
      module: "LESEN",
      resumed: true,
    });
  });

  it("(b) drill path: submitLesen then finalizeSession (no advanceSession), tracks drill_finalized, populates the results store", async () => {
    submitLesenMock.mockResolvedValue({ attempt_id: "lesen-1", raw_score: 2 });
    finalizeSessionMock.mockResolvedValue({
      mockAttemptId: "mock-1",
      status: "finalized",
      finalizedAt: "2026-08-09T00:00:00.000Z",
      perCompetenceReport: { lesen: { status: "scored", raw_score: 2, max_score: 2 } },
      replay: false,
    });

    renderWithI18n(
      <LesenSessionScreen attemptId="lesen-1" mockAttemptId="mock-1" moduleFilter="LESEN" />
    );
    await goToLastItem();
    fireEvent.click(screen.getByTestId("lesen-session-submit"));

    await waitFor(() => expect(finalizeSessionMock).toHaveBeenCalledTimes(1));
    expect(submitLesenMock).toHaveBeenCalledWith({
      attemptId: "lesen-1",
      answers: { i1: "a", i2: "b" },
    });
    expect(finalizeSessionMock).toHaveBeenCalledWith({
      userId: "u1",
      examSlug: "b1-01",
      mockAttemptId: "mock-1",
      answers: { i1: "a", i2: "b" },
    });
    expect(advanceSessionMock).not.toHaveBeenCalled();
    expect(trackEventMock).toHaveBeenCalledWith("exam_module_drill_finalized", {
      attempt_id: "mock-1",
      module: "LESEN",
    });

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/fr/app/examen/lesen/results"));
    expect(useLesenResultsStore.getState().payload?.submissionId).toBe("mock-1");
    // Both items answered correctly (i1="a", i2="b" both match `correct_answer`).
    expect(useLesenResultsStore.getState().payload?.score.correct).toBe(2);
  });

  it("(c) 429 rate_limited rejection grades locally, still navigates to results, and renders no paywall/upgrade copy", async () => {
    submitLesenMock.mockRejectedValue(new Error("rate_limited"));

    renderWithI18n(
      <LesenSessionScreen attemptId="lesen-1" mockAttemptId="mock-1" moduleFilter="LESEN" />
    );
    await goToLastItem();
    fireEvent.click(screen.getByTestId("lesen-session-submit"));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/fr/app/examen/lesen/results"));
    expect(finalizeSessionMock).not.toHaveBeenCalled();

    const payload = useLesenResultsStore.getState().payload;
    expect(payload?.submissionId).toMatch(/^local-/);
    expect(payload?.score.correct).toBe(2);

    expect(screen.queryByText(/premium|upgrade|abonnement/i)).toBeNull();
  });
});

describe("LesenResultsScreen", () => {
  beforeEach(() => {
    pushMock.mockReset();
    replaceMock.mockReset();
    useLesenResultsStore.getState().clear();
  });
  afterEach(cleanup);

  it("empty store redirects to the Lesen intro route", async () => {
    renderWithI18n(<LesenResultsScreen />);

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/fr/app/examen/lesen"));
  });

  it("populated store renders the accuracy percentage and per-Teil rows", async () => {
    useLesenResultsStore.getState().set({
      submissionId: "mock-1",
      score: {
        correct: 1,
        total: 2,
        answered: 2,
        unanswered: 0,
        accuracy: 0.5,
        parts: [
          { partId: "b1-01-t1", teilNumber: 1, label: "Teil 1", correct: 1, total: 2, items: [] },
        ],
      },
    });

    renderWithI18n(<LesenResultsScreen />);

    await waitFor(() => expect(screen.getByTestId("lesen-results-screen")).toBeInTheDocument());
    expect(screen.getByText("50 % de bonnes réponses")).toBeInTheDocument();
    expect(screen.getByText("Teil 1")).toBeInTheDocument();
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
