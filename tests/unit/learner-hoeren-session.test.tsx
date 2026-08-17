import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `vi.hoisted` — `vi.mock` factories are hoisted above the rest of the
// module, so any mock fn they reference must be built via `vi.hoisted`, not
// a plain top-level `const` (same TDZ rationale as `learner-lesen-session.test.tsx`).
const {
  useHoerenSessionMock,
  submitHoerenMock,
  submitHoerenSessionMock,
  advanceSessionMock,
  finalizeSessionMock,
  trackEventMock,
  pushMock,
  replaceMock,
  backMock,
  reloadMock,
  useExamTimerMock,
  realUseExamTimerHolder,
} = vi.hoisted(() => ({
  useHoerenSessionMock: vi.fn(),
  submitHoerenMock: vi.fn(),
  submitHoerenSessionMock: vi.fn(),
  advanceSessionMock: vi.fn(),
  finalizeSessionMock: vi.fn(),
  trackEventMock: vi.fn(),
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
  backMock: vi.fn(),
  reloadMock: vi.fn(),
  useExamTimerMock: vi.fn(),
  realUseExamTimerHolder: { current: null as unknown },
}));

// Full mock — the screen's own `currentPartIndex` stepper (not
// `useExamPlayer`'s item cursor) drives navigation, so this test hand-rolls
// `player` via the REAL `useExamPlayer` hook fed a fixture `ExamSession`
// (real reducer semantics for `pick`/`submit`/`answers`), while `status`/
// `attemptId`/`audioUrlBySlug` stay fully test-controlled. Per-test
// `mockImplementation` (not a shared default) — no status transitions are
// exercised within a single test.
vi.mock("@/learner/hoeren/hooks/useHoerenSession", () => ({
  useHoerenSession: (...args: unknown[]) => useHoerenSessionMock(...args),
}));

// Stub the whole player component (brief's "via the player component or
// hook mock" option) — its own behaviour is already covered by
// `learner-hoeren-audio-player.test.tsx`; this test only needs to assert
// the `url`/`missing`/`onReload` wiring.
vi.mock("@/learner/hoeren/components/HoerenAudioPlayer", () => ({
  HoerenAudioPlayer: (props: { url: string | null; missing: boolean; onReload?: () => void }) => (
    <div data-testid="hoeren-audio-player-stub">
      <span data-testid="hoeren-audio-player-stub-url">
        {props.missing || !props.url ? "missing" : props.url}
      </span>
      <button
        type="button"
        data-testid="hoeren-audio-player-stub-reload"
        onClick={() => props.onReload?.()}
      >
        reload
      </button>
    </div>
  ),
}));

// Partial mock: keep the real `normaliseReport` (pure — no reason to fake
// it) but stub `submitHoeren`, same idiom as `learner-lesen-session.test.tsx`'s
// partial mock of `mockExam`.
vi.mock("@/learner/core/api/examApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/core/api/examApi")>();
  return {
    ...actual,
    submitHoeren: (...args: unknown[]) => submitHoerenMock(...args),
  };
});
vi.mock("@/learner/hoeren/api/submit", () => ({
  submitHoerenSession: (...args: unknown[]) => submitHoerenSessionMock(...args),
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

// Partial mock — default implementation delegates to the real hook; only
// the #472 regression test (b) overrides the return value to force
// `isExpired: true` (a real 0-part/0-duration session is untimed —
// `computeTimerState` never expires it — so the guard is the only thing
// that can stop a forced expiry from submitting an empty session).
vi.mock("@/learner/core/exam/useExamTimer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/core/exam/useExamTimer")>();
  realUseExamTimerHolder.current = actual.useExamTimer;
  return {
    ...actual,
    useExamTimer: (...args: Parameters<typeof actual.useExamTimer>) => useExamTimerMock(...args),
  };
});

import { initLearnerI18n } from "@/learner/core/i18n";
import { useLearnerSession } from "@/learner/core/auth/useLearnerSession";
import { useExamPlayer } from "@/learner/core/exam/engine/useExamPlayer";
import type { ExamItem, ExamSession } from "@/learner/core/exam/engine/types";
import { HoerenSessionScreen } from "@/learner/hoeren/screens/HoerenSessionScreen";
import { useHoerenResultsStore } from "@/learner/hoeren/resultsStore";
import { useSimulationRun } from "@/learner/core/exam/simulationRunStore";
import { renderWithI18n } from "./helpers/renderWithI18n";

function makeItem(id: string, number: number, correctKey: string, stimulusSlug: string): ExamItem {
  return {
    id,
    number,
    stem: `Frage ${number}`,
    answerFormat: "MC_SINGLE_3",
    options: [
      { key: "a", text: "Antwort A" },
      { key: "b", text: "Antwort B" },
      { key: "c", text: "Antwort C" },
    ],
    correctKey,
    stimulusSlug,
  };
}

const emptySession: ExamSession = {
  id: "empty-hoeren",
  examSlug: "",
  moduleCode: "HOEREN",
  title: "",
  totalDurationMinutes: 0,
  parts: [],
};

const twoPartSession: ExamSession = {
  id: "hoeren-sess-1",
  examSlug: "b1-01",
  moduleCode: "HOEREN",
  title: "Modelltest 1 · Hören",
  totalDurationMinutes: 20,
  parts: [
    {
      id: "b1-01-t1",
      teilNumber: 1,
      label: "Teil 1",
      partKind: "GLOBALVERSTEHEN",
      durationMinutes: 10,
      instructions: "Höre den Text.",
      items: [makeItem("i1", 1, "a", "track-1")],
    },
    {
      id: "b1-01-t2",
      teilNumber: 2,
      label: "Teil 2",
      partKind: "DETAILVERSTEHEN",
      durationMinutes: 10,
      instructions: "",
      items: [makeItem("i2", 1, "b", "track-2")],
    },
  ],
};

const onePartSession: ExamSession = {
  id: "hoeren-sess-2",
  examSlug: "b1-01",
  moduleCode: "HOEREN",
  title: "Modelltest 1 · Hören",
  totalDurationMinutes: 20,
  parts: [
    {
      id: "b1-01-t1",
      teilNumber: 1,
      label: "Teil 1",
      partKind: "GLOBALVERSTEHEN",
      durationMinutes: 20,
      instructions: "",
      items: [makeItem("i1", 1, "a", "track-1")],
    },
  ],
};

// web#28: a single Teil with two items that share the same option alphabet
// ("a"/"b"/"c") — the fixture that exposes the positional-testID defect.
// Before the fix, `hoeren-option-<key>` was keyed on the option letter
// alone, so both items rendered an identical `data-testid="hoeren-option-a"`
// (and `-b`/`-c`), making the option unreachable by testID without falling
// back to DOM order.
const duplicateOptionsSession: ExamSession = {
  id: "hoeren-sess-dup",
  examSlug: "b1-01",
  moduleCode: "HOEREN",
  title: "Modelltest 1 · Hören",
  totalDurationMinutes: 10,
  parts: [
    {
      id: "b1-01-t1",
      teilNumber: 1,
      label: "Teil 1",
      partKind: "GLOBALVERSTEHEN",
      durationMinutes: 10,
      instructions: "",
      items: [makeItem("i1", 1, "a", "track-1"), makeItem("i2", 2, "b", "track-1")],
    },
  ],
};

const TWO_PART_AUDIO: Record<string, string | null> = {
  "track-1": "https://cdn.example/t1.mp3",
  "track-2": "https://cdn.example/t2.mp3",
};

interface MockedHoerenSessionArgs {
  readonly status: "loading" | "ready" | "unsupported" | "error";
  readonly session: ExamSession;
  readonly audioUrlBySlug?: Record<string, string | null>;
  readonly attemptId?: string | null;
}

/** Renders the REAL `useExamPlayer` reducer against a fixture session so
 * `pick`/`submit`/`answers` behave exactly as in production, while
 * `status`/`attemptId`/`audioUrlBySlug` stay fully test-controlled. Must
 * only be called from inside `useHoerenSessionMock`'s mock implementation
 * (i.e. during the screen's own render) — it calls a hook. */
function useMockedHoerenSession(args: MockedHoerenSessionArgs) {
  const player = useExamPlayer(args.session);
  return {
    player,
    audioTracks: {},
    audioUrlBySlug: args.audioUrlBySlug ?? {},
    reload: reloadMock,
    isEmpty: false,
    slug: args.session.examSlug,
    status: args.status,
    error: null,
    attemptId: args.attemptId ?? null,
    level: "B1",
    examLabel: "Hören · B1",
  };
}

/** Manually-resolved promise — lets a test hold `submitHoeren` pending so it
 * can assert on state *while* a submit is in flight (S4 4.9 precedent). */
function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("HoerenSessionScreen — Teil stepper, both modes (Task 5.7)", () => {
  beforeEach(() => {
    useHoerenSessionMock.mockReset();
    submitHoerenMock.mockReset();
    submitHoerenSessionMock.mockReset();
    advanceSessionMock.mockReset();
    finalizeSessionMock.mockReset();
    trackEventMock.mockReset();
    pushMock.mockReset();
    replaceMock.mockReset();
    backMock.mockReset();
    reloadMock.mockReset();
    useExamTimerMock.mockReset();
    useExamTimerMock.mockImplementation(
      realUseExamTimerHolder.current as typeof import("@/learner/core/exam/useExamTimer").useExamTimer
    );
    useLearnerSession.setState({
      status: "authenticated",
      session: { user: { id: "u1" } },
    } as never);
    useHoerenResultsStore.getState().clear();
    useSimulationRun.getState().clear();
  });
  afterEach(cleanup);

  it("(a) ready session renders Teil 1 with the audio player and options; next steps to Teil 2", async () => {
    useHoerenSessionMock.mockImplementation(() =>
      useMockedHoerenSession({
        status: "ready",
        session: twoPartSession,
        audioUrlBySlug: TWO_PART_AUDIO,
        attemptId: null,
      })
    );

    renderWithI18n(<HoerenSessionScreen />);

    expect(screen.getByTestId("hoeren-session-container")).toBeInTheDocument();
    expect(screen.getByText("Teil 1 von 2")).toBeInTheDocument();
    expect(screen.getByTestId("hoeren-audio-player-stub-url").textContent).toBe(
      "https://cdn.example/t1.mp3"
    );
    expect(screen.getByTestId("hoeren-option-i1-a")).toBeInTheDocument();
    expect(screen.getByTestId("hoeren-option-i1-b")).toBeInTheDocument();
    expect(screen.getByTestId("hoeren-option-i1-c")).toBeInTheDocument();
    expect(screen.getByText("Aufgabe 1")).toBeInTheDocument();
    // Not the last Teil — "Weiter" renders, not "Abgeben".
    expect(screen.getByTestId("hoeren-session-next")).toBeInTheDocument();
    expect(screen.queryByTestId("hoeren-session-submit")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("hoeren-session-next"));

    expect(screen.getByText("Teil 2 von 2")).toBeInTheDocument();
    expect(screen.getByTestId("hoeren-audio-player-stub-url").textContent).toBe(
      "https://cdn.example/t2.mp3"
    );
    // Last Teil — footer swaps to "Abgeben".
    expect(screen.getByTestId("hoeren-session-submit")).toBeInTheDocument();
    expect(screen.queryByTestId("hoeren-session-next")).not.toBeInTheDocument();
  });

  it("(b) #472 regression: ready + 0 parts never renders exam chrome and never submits, even under a forced timer expiry", async () => {
    useExamTimerMock.mockReturnValue({ remainingSeconds: 0, isExpired: true, elapsedFraction: 1 });
    useHoerenSessionMock.mockImplementation(() =>
      useMockedHoerenSession({ status: "ready", session: emptySession, attemptId: null })
    );

    renderWithI18n(<HoerenSessionScreen />);

    expect(screen.getByTestId("hoeren-session-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("hoeren-session-container")).not.toBeInTheDocument();
    expect(screen.queryByTestId("hoeren-session-submit")).not.toBeInTheDocument();

    // Flush any pending effects (the expiry effect runs on mount here,
    // since `useExamTimer` is mocked to report `isExpired: true` from the
    // very first render).
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(submitHoerenSessionMock).not.toHaveBeenCalled();
    expect(submitHoerenMock).not.toHaveBeenCalled();
    expect(finalizeSessionMock).not.toHaveBeenCalled();
    expect(advanceSessionMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("web#32: ready + 0 parts in EXAM mode (mockAttemptId present) renders the exam-specific empty state with a working exit back to the picker — practice mode's own copy/behavior (test (b) above) is untouched", async () => {
    useHoerenSessionMock.mockImplementation(() =>
      useMockedHoerenSession({ status: "ready", session: emptySession, attemptId: "hoeren-1" })
    );

    renderWithI18n(<HoerenSessionScreen attemptId="hoeren-1" mockAttemptId="mock-1" />);

    expect(screen.getByTestId("hoeren-session-empty")).toBeInTheDocument();
    expect(screen.getByText("Aucune question dans cette simulation.")).toBeInTheDocument();
    expect(
      screen.getByText("Ce module n'est pas disponible pour ce modelltest.")
    ).toBeInTheDocument();
    // web#60 — `EmptyState` no longer has a default illustration at all
    // (the old 📖 default was outside the brand-voice emoji lock
    // `📍 ⏱ ✓ ✕`); this call site passes no `illustration`, so it renders
    // none.
    expect(screen.getByTestId("hoeren-session-empty").textContent).not.toContain("\u{1F4D6}");

    fireEvent.click(screen.getByTestId("hoeren-session-empty-cta"));
    expect(pushMock).toHaveBeenCalledWith("/fr/app/examen/modelltests");
  });

  it("(c) practice submit: submitHoerenSession called with a synthesized local- attemptId, store mode:practice, pushes to /fr/app/hoeren/results", async () => {
    submitHoerenSessionMock.mockResolvedValue({
      submissionId: "local-hoeren-sess-2",
      score: { correct: 1, total: 1, answered: 1, unanswered: 0, accuracy: 1, parts: [] },
      serverGraded: true,
    });
    useHoerenSessionMock.mockImplementation(() =>
      useMockedHoerenSession({
        status: "ready",
        session: onePartSession,
        audioUrlBySlug: { "track-1": "https://cdn.example/t1.mp3" },
        attemptId: null,
      })
    );

    renderWithI18n(<HoerenSessionScreen />);

    fireEvent.click(screen.getByTestId("hoeren-option-i1-a"));
    fireEvent.click(screen.getByTestId("hoeren-session-submit"));

    await waitFor(() => expect(submitHoerenSessionMock).toHaveBeenCalledTimes(1));
    const call = submitHoerenSessionMock.mock.calls[0]?.[0];
    expect(call.attemptId).toBe("local-hoeren-sess-2");
    expect(call.answers).toEqual({ i1: "a" });
    expect(submitHoerenMock).not.toHaveBeenCalled();

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/fr/app/hoeren/results"));
    expect(useHoerenResultsStore.getState().payload?.mode).toBe("practice");
    expect(useHoerenResultsStore.getState().payload?.submissionId).toBe("local-hoeren-sess-2");
  });

  it("(d) graded drill: submitHoeren then finalizeSession (no advance), tracks drill_finalized, store mode:graded", async () => {
    submitHoerenMock.mockResolvedValue({ attempt_id: "hoeren-1", raw_score: 1 });
    finalizeSessionMock.mockResolvedValue({
      mockAttemptId: "mock-1",
      status: "finalized",
      finalizedAt: "2026-08-09T00:00:00.000Z",
      perCompetenceReport: { hoeren: { status: "scored", raw_score: 1, max_score: 1 } },
      replay: false,
    });
    useHoerenSessionMock.mockImplementation(() =>
      useMockedHoerenSession({ status: "ready", session: onePartSession, attemptId: "hoeren-1" })
    );

    renderWithI18n(
      <HoerenSessionScreen attemptId="hoeren-1" mockAttemptId="mock-1" moduleFilter="HOEREN" />
    );

    fireEvent.click(screen.getByTestId("hoeren-option-i1-a"));
    fireEvent.click(screen.getByTestId("hoeren-session-submit"));

    await waitFor(() => expect(finalizeSessionMock).toHaveBeenCalledTimes(1));
    expect(submitHoerenMock).toHaveBeenCalledWith({ attemptId: "hoeren-1", answers: { i1: "a" } });
    expect(finalizeSessionMock).toHaveBeenCalledWith({
      userId: "u1",
      examSlug: "b1-01",
      mockAttemptId: "mock-1",
      answers: { i1: "a" },
    });
    expect(advanceSessionMock).not.toHaveBeenCalled();
    expect(trackEventMock).toHaveBeenCalledWith("exam_module_submitted", {
      attempt_id: "hoeren-1",
      module: "HOEREN",
      duration_ms: expect.any(Number),
    });
    expect(trackEventMock).toHaveBeenCalledWith("exam_module_drill_finalized", {
      attempt_id: "mock-1",
      module: "HOEREN",
    });

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/fr/app/hoeren/results"));
    expect(useHoerenResultsStore.getState().payload?.mode).toBe("graded");
    expect(useHoerenResultsStore.getState().payload?.submissionId).toBe("mock-1");
  });

  it("(e) graded failure: submitHoeren rejects — store still receives a local- submissionId, navigation still happens", async () => {
    submitHoerenMock.mockRejectedValue(new Error("rate_limited"));
    useHoerenSessionMock.mockImplementation(() =>
      useMockedHoerenSession({ status: "ready", session: onePartSession, attemptId: "hoeren-1" })
    );

    renderWithI18n(
      <HoerenSessionScreen attemptId="hoeren-1" mockAttemptId="mock-1" moduleFilter="HOEREN" />
    );

    fireEvent.click(screen.getByTestId("hoeren-option-i1-a"));
    fireEvent.click(screen.getByTestId("hoeren-session-submit"));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/fr/app/hoeren/results"));
    expect(finalizeSessionMock).not.toHaveBeenCalled();

    const payload = useHoerenResultsStore.getState().payload;
    expect(payload?.mode).toBe("graded");
    expect(payload?.submissionId).toMatch(/^local-/);
  });

  it("(f) rapid double/triple-click on submit while submitHoeren is pending calls submitHoeren exactly once", async () => {
    const deferred = createDeferred<{ attempt_id: string; raw_score: number }>();
    submitHoerenMock.mockReturnValue(deferred.promise);
    finalizeSessionMock.mockResolvedValue({
      mockAttemptId: "mock-1",
      status: "finalized",
      finalizedAt: "2026-08-09T00:00:00.000Z",
      perCompetenceReport: {},
      replay: false,
    });
    useHoerenSessionMock.mockImplementation(() =>
      useMockedHoerenSession({ status: "ready", session: onePartSession, attemptId: "hoeren-1" })
    );

    renderWithI18n(
      <HoerenSessionScreen attemptId="hoeren-1" mockAttemptId="mock-1" moduleFilter="HOEREN" />
    );
    fireEvent.click(screen.getByTestId("hoeren-option-i1-a"));

    // Three `fireEvent.click`s inside one outer `act()` — same isolation
    // rationale as `learner-lesen-session.test.tsx` (e): nesting defers the
    // `disabled`-attribute DOM flush to the end of the block, so all three
    // `handleSubmit()` calls run their synchronous prefix — including the
    // `isSubmittingRef` check — against the same not-yet-disabled render.
    const submitButton = screen.getByTestId("hoeren-session-submit");
    act(() => {
      fireEvent.click(submitButton);
      fireEvent.click(submitButton);
      fireEvent.click(submitButton);
    });

    expect(submitHoerenMock).toHaveBeenCalledTimes(1);

    deferred.resolve({ attempt_id: "hoeren-1", raw_score: 1 });
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/fr/app/hoeren/results"));
    expect(submitHoerenMock).toHaveBeenCalledTimes(1);
  });

  it('(g) fires exam_module_started exactly once — under StrictMode\'s mount double-invoke, and across a later legitimate second "ready" transition on the same instance', async () => {
    // NOTE on why this isn't just "wrap in StrictMode", same finding as
    // `learner-lesen-session.test.tsx` (a): React 18 StrictMode only
    // double-invokes effects around the *initial mount*, synchronously,
    // before any microtask runs — confirmed empirically here too (a bare
    // StrictMode wrap with the ref-guard's early-return deleted still left
    // this suite at 1 call; see the task-5.7-report.md guard-removal
    // section for the full trace). The guard's real job is the scenario
    // reproduced below: the *same* mounted instance re-entering "ready" a
    // second time later with a different attempt id (e.g. a client-side
    // route change resuming a different in-progress attempt) — the
    // effect's own dep array (`status`/`attemptId`/`attemptIdParam`) means
    // it legitimately re-runs on that transition regardless of StrictMode,
    // and only the ref (not the dep array) stops it firing twice.
    let hookAttemptId = "hoeren-1";
    useHoerenSessionMock.mockImplementation(() =>
      useMockedHoerenSession({ status: "ready", session: onePartSession, attemptId: hookAttemptId })
    );

    const i18n = initLearnerI18n("fr");
    const tree = (attemptId: string) => (
      <I18nextProvider i18n={i18n}>
        <StrictMode>
          <HoerenSessionScreen attemptId={attemptId} mockAttemptId="mock-1" moduleFilter="HOEREN" />
        </StrictMode>
      </I18nextProvider>
    );
    const { rerender } = render(tree("hoeren-1"));

    await waitFor(() => expect(screen.getByTestId("hoeren-session-container")).toBeInTheDocument());

    hookAttemptId = "hoeren-2";
    rerender(tree("hoeren-2"));

    // Flush any pending microtask chain before reading `trackEvent` calls.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const startedCalls = trackEventMock.mock.calls.filter((c) => c[0] === "exam_module_started");
    expect(startedCalls).toHaveLength(1);
    // `attemptId` prop is present here (a fresh-201 param per
    // `HoerenIntroScreen`'s contract), so this is NOT a resumed attempt —
    // see the (g3)/(g4) pins below for the dedicated web#29 coverage.
    expect(startedCalls[0]?.[1]).toEqual({
      attempt_id: "hoeren-1",
      module: "HOEREN",
      resumed: false,
    });
  });

  it("(g2) practice mode (no attempt id) never fires exam_module_started", async () => {
    useHoerenSessionMock.mockImplementation(() =>
      useMockedHoerenSession({ status: "ready", session: onePartSession, attemptId: null })
    );

    renderWithI18n(<HoerenSessionScreen />);

    await waitFor(() => expect(screen.getByTestId("hoeren-session-container")).toBeInTheDocument());
    // Flush any pending effects before asserting the negative.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const startedCalls = trackEventMock.mock.calls.filter((c) => c[0] === "exam_module_started");
    expect(startedCalls).toHaveLength(0);
  });

  it("(g3) web#29: resumed:false when the route carries a fresh 201 attemptId param", async () => {
    useHoerenSessionMock.mockImplementation(() =>
      useMockedHoerenSession({ status: "ready", session: onePartSession, attemptId: "hoeren-1" })
    );

    renderWithI18n(
      <HoerenSessionScreen attemptId="hoeren-1" mockAttemptId="mock-1" moduleFilter="HOEREN" />
    );

    await waitFor(() =>
      expect(trackEventMock).toHaveBeenCalledWith("exam_module_started", expect.anything())
    );
    const startedCall = trackEventMock.mock.calls.find((c) => c[0] === "exam_module_started");
    expect(startedCall?.[1]).toEqual({
      attempt_id: "hoeren-1",
      module: "HOEREN",
      resumed: false,
    });
  });

  it("(g4) web#29: resumed:true when the route carries only examSlug — the 409-resume path", async () => {
    useHoerenSessionMock.mockImplementation(() =>
      useMockedHoerenSession({ status: "ready", session: onePartSession, attemptId: "hoeren-1" })
    );

    renderWithI18n(
      <HoerenSessionScreen examSlug="b1-01" mockAttemptId="mock-1" moduleFilter="HOEREN" />
    );

    await waitFor(() =>
      expect(trackEventMock).toHaveBeenCalledWith("exam_module_started", expect.anything())
    );
    const startedCall = trackEventMock.mock.calls.find((c) => c[0] === "exam_module_started");
    expect(startedCall?.[1]).toEqual({
      attempt_id: "hoeren-1",
      module: "HOEREN",
      resumed: true,
    });
  });

  it("(h) web#28: option testIDs are scoped per item — hoeren-option-<itemId>-<key> — and stay unique within a rendered Teil", async () => {
    useHoerenSessionMock.mockImplementation(() =>
      useMockedHoerenSession({
        status: "ready",
        session: duplicateOptionsSession,
        audioUrlBySlug: { "track-1": "https://cdn.example/t1.mp3" },
        attemptId: null,
      })
    );

    renderWithI18n(<HoerenSessionScreen />);

    // Two items in the same Teil share the "a"/"b"/"c" option alphabet.
    // Each item's own "a" option must be individually addressable and must
    // be a DISTINCT element — not the same node matched twice, and not a
    // positional first-match.
    const i1OptionA = screen.getByTestId("hoeren-option-i1-a");
    const i2OptionA = screen.getByTestId("hoeren-option-i2-a");
    expect(i1OptionA).toBeInTheDocument();
    expect(i2OptionA).toBeInTheDocument();
    expect(i1OptionA).not.toBe(i2OptionA);

    // Clicking each item's own "a" option only picks that item's answer —
    // proves the testID is wired to the correct item, not just uniquely
    // labelled.
    fireEvent.click(i2OptionA);
    expect(i2OptionA.getAttribute("aria-checked")).toBe("true");
    expect(i1OptionA.getAttribute("aria-checked")).toBe("false");

    // No two rendered options collide on a testID anywhere in this Teil —
    // the general uniqueness guarantee the composed format exists to
    // provide (six options total: two items x three keys).
    const allOptionTestIds = screen
      .getAllByRole("radio")
      .map((el) => el.getAttribute("data-testid"));
    expect(allOptionTestIds).toHaveLength(6);
    expect(new Set(allOptionTestIds).size).toBe(allOptionTestIds.length);
  });
});

describe("HoerenSessionScreen — full-simulation branch (Task 8.5)", () => {
  beforeEach(() => {
    useHoerenSessionMock.mockReset();
    submitHoerenMock.mockReset();
    submitHoerenSessionMock.mockReset();
    advanceSessionMock.mockReset();
    finalizeSessionMock.mockReset();
    trackEventMock.mockReset();
    pushMock.mockReset();
    replaceMock.mockReset();
    backMock.mockReset();
    reloadMock.mockReset();
    useExamTimerMock.mockReset();
    useExamTimerMock.mockImplementation(
      realUseExamTimerHolder.current as typeof import("@/learner/core/exam/useExamTimer").useExamTimer
    );
    useLearnerSession.setState({
      status: "authenticated",
      session: { user: { id: "u1" } },
    } as never);
    useHoerenResultsStore.getState().clear();
    useSimulationRun.getState().clear();
  });
  afterEach(cleanup);

  it("(a) submit records raw/total/unanswered + duration into the simulation run store before advancing", async () => {
    submitHoerenMock.mockResolvedValue({ attempt_id: "hoeren-1", raw_score: 1 });
    advanceSessionMock.mockResolvedValue({ mockAttemptId: "mock-1", nextModule: "SCHREIBEN" });
    useHoerenSessionMock.mockImplementation(() =>
      useMockedHoerenSession({
        status: "ready",
        session: twoPartSession,
        audioUrlBySlug: TWO_PART_AUDIO,
        attemptId: "hoeren-1",
      })
    );

    renderWithI18n(<HoerenSessionScreen attemptId="hoeren-1" mockAttemptId="mock-1" />);

    fireEvent.click(screen.getByTestId("hoeren-option-i1-a")); // Teil 1 item answered
    fireEvent.click(screen.getByTestId("hoeren-session-next"));
    await waitFor(() => expect(screen.getByTestId("hoeren-session-submit")).toBeInTheDocument());
    // Teil 2 item left unanswered — proves `unanswered` comes from the
    // real fixture/player state, not a hardcoded 0.
    fireEvent.click(screen.getByTestId("hoeren-session-submit"));

    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith("/fr/app/examen/simulation?examSlug=b1-01")
    );

    expect(useSimulationRun.getState().outcomes.hoeren).toEqual({
      raw: 1,
      total: 2,
      unanswered: 1,
    });
    // Fixture session duration is 20 minutes.
    expect(useSimulationRun.getState().durationMinutesTotal).toBe(20);
  });

  it('(c) REAL server response: advanceSession resolving nextModule:"SCHREIBEN" redirects to the orchestrator (P6) and writes no results store/route', async () => {
    submitHoerenMock.mockResolvedValue({ attempt_id: "hoeren-1", raw_score: 1 });
    advanceSessionMock.mockResolvedValue({ mockAttemptId: "mock-1", nextModule: "SCHREIBEN" });
    useHoerenSessionMock.mockImplementation(() =>
      useMockedHoerenSession({ status: "ready", session: onePartSession, attemptId: "hoeren-1" })
    );

    renderWithI18n(<HoerenSessionScreen attemptId="hoeren-1" mockAttemptId="mock-1" />);
    fireEvent.click(screen.getByTestId("hoeren-option-i1-a"));
    fireEvent.click(screen.getByTestId("hoeren-session-submit"));

    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith("/fr/app/examen/simulation?examSlug=b1-01")
    );

    expect(finalizeSessionMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
    expect(useHoerenResultsStore.getState().payload).toBeNull();
    expect(useSimulationRun.getState().result).toBeNull();
  });

  it("(c') DEFENSIVE PARITY ONLY: advanceSession resolving nextModule:null finalizes into the run store and routes to /examen/simulation/results (backend can never return this for a leg)", async () => {
    submitHoerenMock.mockResolvedValue({ attempt_id: "hoeren-1", raw_score: 1 });
    advanceSessionMock.mockResolvedValue({ mockAttemptId: "mock-1", nextModule: null });
    finalizeSessionMock.mockResolvedValue({
      mockAttemptId: "mock-1",
      status: "finalized",
      finalizedAt: "2026-08-09T00:00:00.000Z",
      perCompetenceReport: { hoeren: { status: "scored", raw_score: 1, max_score: 1 } },
      replay: false,
    });
    useHoerenSessionMock.mockImplementation(() =>
      useMockedHoerenSession({ status: "ready", session: onePartSession, attemptId: "hoeren-1" })
    );

    renderWithI18n(<HoerenSessionScreen attemptId="hoeren-1" mockAttemptId="mock-1" />);
    fireEvent.click(screen.getByTestId("hoeren-option-i1-a"));
    fireEvent.click(screen.getByTestId("hoeren-session-submit"));

    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith("/fr/app/examen/simulation/results")
    );
    expect(finalizeSessionMock).toHaveBeenCalledWith({
      userId: "u1",
      examSlug: "b1-01",
      mockAttemptId: "mock-1",
      answers: { i1: "a" },
    });
    expect(trackEventMock).toHaveBeenCalledWith("exam_finalized", {
      attempt_id: "mock-1",
      duration_ms: expect.any(Number),
    });

    const result = useSimulationRun.getState().result;
    expect(result?.finalizedAt).toBe("2026-08-09T00:00:00.000Z");
    expect(result?.report).toEqual({
      hoeren: { status: "scored", raw_score: 1, max_score: 1 },
    });
    expect(result?.skills).toEqual([
      { key: "lesen", status: "missing", score: null, max: null },
      { key: "hoeren", status: "scored", score: 1, max: 1 },
      { key: "schreiben", status: "missing", score: null, max: null },
      { key: "sprechen", status: "missing", score: null, max: null },
    ]);
  });

  it("(d) drill regression lock: moduleFilter:HOEREN never touches recordOutcome or the simulation routes", async () => {
    submitHoerenMock.mockResolvedValue({ attempt_id: "hoeren-1", raw_score: 1 });
    finalizeSessionMock.mockResolvedValue({
      mockAttemptId: "mock-1",
      status: "finalized",
      finalizedAt: "2026-08-09T00:00:00.000Z",
      perCompetenceReport: { hoeren: { status: "scored", raw_score: 1, max_score: 1 } },
      replay: false,
    });
    useHoerenSessionMock.mockImplementation(() =>
      useMockedHoerenSession({ status: "ready", session: onePartSession, attemptId: "hoeren-1" })
    );

    renderWithI18n(
      <HoerenSessionScreen attemptId="hoeren-1" mockAttemptId="mock-1" moduleFilter="HOEREN" />
    );
    fireEvent.click(screen.getByTestId("hoeren-option-i1-a"));
    fireEvent.click(screen.getByTestId("hoeren-session-submit"));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/fr/app/hoeren/results"));

    expect(advanceSessionMock).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
    expect(useSimulationRun.getState().outcomes.hoeren).toBeUndefined();
    expect(useSimulationRun.getState().result).toBeNull();
  });

  it("(e) advance rejection in the full-sim branch: shipped local-fallback catch still navigates to per-module results", async () => {
    submitHoerenMock.mockResolvedValue({ attempt_id: "hoeren-1", raw_score: 1 });
    advanceSessionMock.mockRejectedValue(new Error("network_error"));
    useHoerenSessionMock.mockImplementation(() =>
      useMockedHoerenSession({ status: "ready", session: onePartSession, attemptId: "hoeren-1" })
    );

    renderWithI18n(<HoerenSessionScreen attemptId="hoeren-1" mockAttemptId="mock-1" />);
    fireEvent.click(screen.getByTestId("hoeren-option-i1-a"));
    fireEvent.click(screen.getByTestId("hoeren-session-submit"));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/fr/app/hoeren/results"));
    expect(replaceMock).not.toHaveBeenCalled();
    expect(finalizeSessionMock).not.toHaveBeenCalled();

    const payload = useHoerenResultsStore.getState().payload;
    expect(payload?.mode).toBe("graded");
    expect(payload?.submissionId).toMatch(/^local-/);
    // `recordOutcome` already ran (before the rejecting `advanceSession`
    // call) — this is the shipped ordering (brief interface note (a) runs
    // BEFORE `advanceSession`), so the outcome is still recorded even
    // though the chain-continuation redirect never fires.
    expect(useSimulationRun.getState().outcomes.hoeren).toEqual({
      raw: 1,
      total: 1,
      unanswered: 0,
    });
  });
});
