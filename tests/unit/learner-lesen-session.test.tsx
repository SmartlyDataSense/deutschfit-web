import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
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
// Partial mock (S8 · Task 8.1 facade-hygiene): `LesenSessionScreen` now
// imports `normaliseReport` from the `examApi` facade too (not `mockExam`
// directly) — keep the real `normaliseReport` (pure — no reason to fake
// it, same rationale as the `mockExam` partial mock above) and stub only
// `submitLesen`.
vi.mock("@/learner/core/api/examApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/core/api/examApi")>();
  return {
    ...actual,
    submitLesen: (...args: unknown[]) => submitLesenMock(...args),
  };
});
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

import { initLearnerI18n } from "@/learner/core/i18n";
import { useLearnerSession } from "@/learner/core/auth/useLearnerSession";
import { LesenResultsScreen } from "@/learner/lesen/screens/LesenResultsScreen";
import { LesenSessionScreen } from "@/learner/lesen/screens/LesenSessionScreen";
import { useLesenResultsStore } from "@/learner/lesen/resultsStore";
import { useSimulationRun } from "@/learner/core/exam/simulationRunStore";
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

/** Manually-resolved promise — lets a test hold `submitLesen` pending so it
 * can assert on state *while* a submit is in flight. */
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
    useSimulationRun.getState().clear();
  });
  afterEach(cleanup);

  it('(a) fires exam_module_started exactly once — under StrictMode\'s mount double-invoke, and across a later legitimate second "ready" transition on the same instance', async () => {
    // NOTE on why this isn't just "wrap in StrictMode": React 18 StrictMode
    // only double-invokes effects around the *initial mount* (mount → run
    // effects → simulate unmount → remount → run effects again), all
    // synchronously, before any microtask runs. `useLesenSession`'s fetch
    // effect *does* get double-invoked that way (two `fetchLesenSession`
    // calls), but its `cancelled`-flag cleanup (useLesenSession.ts:64,84-86)
    // already discards the stale (first) instance's resolution — so exactly
    // one `status → "ready"` transition ever reaches this component, StrictMode
    // or not. Confirmed empirically in fix-round-1 review: temporarily
    // removing the `startedRef` guard with only a StrictMode wrapper in
    // place left this test passing unchanged (still 1 call) — StrictMode
    // alone does not exercise the guard here. See task-4.9-report.md,
    // fix-round-1 section, for the full writeup.
    //
    // The guard's real job is the scenario reproduced below: the *same*
    // mounted instance re-entering "ready" a second time later (e.g. a
    // client-side route change resuming a different in-progress attempt
    // without a full remount) — `useLesenSession`'s fetch effect deps
    // (`hasArgs`/`args.attemptId`/`args.examSlug`) change, so it re-fetches
    // and transitions ready → loading → ready again. Rendered locally (not
    // via the shared `renderWithI18n` helper, per fix-round-1's
    // instruction) so `rerender()` can reuse the same real i18next
    // instance and the same `<StrictMode>` wrapper across both renders.
    fetchLesenSessionMock.mockImplementation(async (arg: unknown) => {
      const requested = (arg as { attemptId?: string } | undefined)?.attemptId;
      return { ...readyPayload, attemptId: requested ?? readyPayload.attemptId };
    });

    const i18n = initLearnerI18n("fr");
    const tree = (id: string) => (
      <I18nextProvider i18n={i18n}>
        <StrictMode>
          <LesenSessionScreen attemptId={id} mockAttemptId="mock-1" moduleFilter="LESEN" />
        </StrictMode>
      </I18nextProvider>
    );
    const { rerender } = render(tree("lesen-1"));

    await waitFor(() =>
      expect(screen.getByTestId("lesen-session-option-list")).toBeInTheDocument()
    );

    rerender(tree("lesen-2"));
    expect(fetchLesenSessionMock).toHaveBeenCalledWith({ attemptId: "lesen-2" });

    // Flush the second fetch's microtask chain — a real, near-instant
    // Promise (no fake timers needed) — before reading `trackEvent` calls.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const startedCalls = trackEventMock.mock.calls.filter((c) => c[0] === "exam_module_started");
    expect(startedCalls).toHaveLength(1);
    // `attemptId` prop is present here (a fresh-201 param per
    // `LesenIntroScreen`'s contract), so this is NOT a resumed attempt —
    // see the (h)/(i) pins below for the dedicated web#29 coverage.
    expect(startedCalls[0]?.[1]).toEqual({
      attempt_id: "lesen-1",
      module: "LESEN",
      resumed: false,
    });
  });

  it("(h) web#29: resumed:false when the route carries a fresh 201 attemptId param", async () => {
    renderWithI18n(
      <LesenSessionScreen attemptId="lesen-1" mockAttemptId="mock-1" moduleFilter="LESEN" />
    );

    await waitFor(() =>
      expect(trackEventMock).toHaveBeenCalledWith("exam_module_started", expect.anything())
    );
    const startedCall = trackEventMock.mock.calls.find((c) => c[0] === "exam_module_started");
    expect(startedCall?.[1]).toEqual({
      attempt_id: "lesen-1",
      module: "LESEN",
      resumed: false,
    });
  });

  it("(i) web#29: resumed:true when the route carries only examSlug — the 409-resume path", async () => {
    renderWithI18n(
      <LesenSessionScreen examSlug="b1-01" mockAttemptId="mock-1" moduleFilter="LESEN" />
    );

    await waitFor(() =>
      expect(trackEventMock).toHaveBeenCalledWith("exam_module_started", expect.anything())
    );
    // Confirms the hook actually bootstrapped via the examSlug branch
    // (`lesen-start`), not a leftover attemptId — same signal
    // `LesenIntroScreen`'s 409 path produces.
    expect(fetchLesenSessionMock).toHaveBeenCalledWith("b1-01");
    const startedCall = trackEventMock.mock.calls.find((c) => c[0] === "exam_module_started");
    expect(startedCall?.[1]).toEqual({
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

  it("(e) rapid double/triple-click on submit while submitLesen is pending calls submitLesen exactly once", async () => {
    const deferred = createDeferred<{ attempt_id: string; raw_score: number }>();
    submitLesenMock.mockReturnValue(deferred.promise);
    finalizeSessionMock.mockResolvedValue({
      mockAttemptId: "mock-1",
      status: "finalized",
      finalizedAt: "2026-08-09T00:00:00.000Z",
      perCompetenceReport: {},
      replay: false,
    });

    renderWithI18n(
      <LesenSessionScreen attemptId="lesen-1" mockAttemptId="mock-1" moduleFilter="LESEN" />
    );
    await goToLastItem();

    // Three `fireEvent.click`s inside a single synchronous `act()` call.
    // `fireEvent.click` on its own already wraps each dispatch in its own
    // `act()` — which flushes `setIsSubmitting(true)` (and the button's
    // `disabled` attribute) to the DOM *before* returning, meaning a
    // second bare `fireEvent.click()` would already be clicking a
    // genuinely-disabled button and prove nothing about the ref guard
    // (confirmed empirically in fix-round-1 review: with the guard
    // removed, three bare back-to-back `fireEvent.click()` calls still
    // left `submitLesenMock` at 1 call — the disabled attribute alone was
    // doing the work). Nesting all three inside one outer `act()` defers
    // that flush to the end of this block (React only commits at the
    // outermost `act()` boundary), so all three `handleSubmit()` calls run
    // their synchronous prefix — including the `isSubmittingRef` check —
    // against the same not-yet-disabled render, genuinely isolating the
    // ref guard from the DOM.
    const submitButton = screen.getByTestId("lesen-session-submit");
    act(() => {
      fireEvent.click(submitButton);
      fireEvent.click(submitButton);
      fireEvent.click(submitButton);
    });

    expect(submitLesenMock).toHaveBeenCalledTimes(1);

    // Let the held submit resolve so the test doesn't leak a pending act().
    deferred.resolve({ attempt_id: "lesen-1", raw_score: 2 });
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/fr/app/examen/lesen/results"));
    expect(submitLesenMock).toHaveBeenCalledTimes(1);
  });

  it("(f) timer expiry firing while a manual submit is in flight still calls submitLesen exactly once", async () => {
    vi.useFakeTimers();
    try {
      const deferred = createDeferred<{ attempt_id: string; raw_score: number }>();
      submitLesenMock.mockReturnValue(deferred.promise);

      renderWithI18n(
        <LesenSessionScreen attemptId="lesen-1" mockAttemptId="mock-1" moduleFilter="LESEN" />
      );

      // Flush the initial `fetchLesenSession` fetch — a resolved promise,
      // no real timer needed. Same idiom as
      // `learner-onboarding-diagnostic.test.tsx`'s "flush fetch" step.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      fireEvent.click(screen.getByTestId("lesen-option-a")); // item 1
      fireEvent.click(screen.getByTestId("lesen-session-next"));
      fireEvent.click(screen.getByTestId("lesen-option-b")); // item 2

      // Manual submit — `submitLesen`'s promise stays pending for the rest
      // of this test, so `isSubmittingRef` is held the whole time below.
      fireEvent.click(screen.getByTestId("lesen-session-submit"));
      expect(submitLesenMock).toHaveBeenCalledTimes(1);

      // Run the countdown past the session's total duration (20 min, from
      // the fixture manifest). `useExamTimer`'s own interval detects
      // expiry and invokes its `onExpire` callback internally, which calls
      // `handleSubmit()` a second time — with nothing routed through the
      // DOM, so only the `isSubmittingRef` guard (not the disabled button)
      // can prevent a second `submitLesen` call here.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(21 * 60 * 1000);
      });

      expect(submitLesenMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("LesenSessionScreen — full-simulation branch (Task 8.5)", () => {
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
    useSimulationRun.getState().clear();
  });
  afterEach(cleanup);

  it("(a) submit records raw/total/unanswered + duration into the simulation run store before advancing", async () => {
    submitLesenMock.mockResolvedValue({ attempt_id: "lesen-1", raw_score: 1 });
    advanceSessionMock.mockResolvedValue({ mockAttemptId: "mock-1", nextModule: "HOEREN" });

    renderWithI18n(<LesenSessionScreen attemptId="lesen-1" mockAttemptId="mock-1" />);

    await waitFor(() => expect(screen.getByTestId("lesen-option-a")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("lesen-option-a")); // item 1 answered
    fireEvent.click(screen.getByTestId("lesen-session-next"));
    await waitFor(() => expect(screen.getByTestId("lesen-session-submit")).toBeInTheDocument());
    // item 2 left unanswered — proves `unanswered` comes from the real
    // fixture/player state, not a hardcoded 0.
    fireEvent.click(screen.getByTestId("lesen-session-submit"));

    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith("/fr/app/examen/simulation?examSlug=b1-01")
    );

    expect(useSimulationRun.getState().outcomes.lesen).toEqual({
      raw: 1,
      total: 2,
      unanswered: 1,
    });
    // Fixture manifest module duration is 20 minutes.
    expect(useSimulationRun.getState().durationMinutesTotal).toBe(20);
  });

  it('(b) advanceSession resolving nextModule:"HOEREN" redirects to the orchestrator (P6) and writes no results store/route', async () => {
    submitLesenMock.mockResolvedValue({ attempt_id: "lesen-1", raw_score: 2 });
    advanceSessionMock.mockResolvedValue({ mockAttemptId: "mock-1", nextModule: "HOEREN" });

    renderWithI18n(<LesenSessionScreen attemptId="lesen-1" mockAttemptId="mock-1" />);
    await goToLastItem();
    fireEvent.click(screen.getByTestId("lesen-session-submit"));

    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith("/fr/app/examen/simulation?examSlug=b1-01")
    );

    expect(finalizeSessionMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
    expect(useLesenResultsStore.getState().payload).toBeNull();
    expect(useSimulationRun.getState().result).toBeNull();
  });

  it("(c') DEFENSIVE PARITY ONLY: advanceSession resolving nextModule:null finalizes into the run store and routes to /examen/simulation/results (backend can never return this for a leg)", async () => {
    submitLesenMock.mockResolvedValue({ attempt_id: "lesen-1", raw_score: 2 });
    advanceSessionMock.mockResolvedValue({ mockAttemptId: "mock-1", nextModule: null });
    finalizeSessionMock.mockResolvedValue({
      mockAttemptId: "mock-1",
      status: "finalized",
      finalizedAt: "2026-08-09T00:00:00.000Z",
      perCompetenceReport: { lesen: { status: "scored", raw_score: 2, max_score: 2 } },
      replay: false,
    });

    renderWithI18n(<LesenSessionScreen attemptId="lesen-1" mockAttemptId="mock-1" />);
    await goToLastItem();
    fireEvent.click(screen.getByTestId("lesen-session-submit"));

    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith("/fr/app/examen/simulation/results")
    );
    expect(finalizeSessionMock).toHaveBeenCalledWith({
      userId: "u1",
      examSlug: "b1-01",
      mockAttemptId: "mock-1",
      answers: { i1: "a", i2: "b" },
    });
    expect(trackEventMock).toHaveBeenCalledWith("exam_finalized", {
      attempt_id: "mock-1",
      duration_ms: expect.any(Number),
    });

    const result = useSimulationRun.getState().result;
    expect(result?.finalizedAt).toBe("2026-08-09T00:00:00.000Z");
    expect(result?.report).toEqual({
      lesen: { status: "scored", raw_score: 2, max_score: 2 },
    });
    expect(result?.skills).toEqual([
      { key: "lesen", status: "scored", score: 2, max: 2 },
      { key: "hoeren", status: "missing", score: null, max: null },
      { key: "schreiben", status: "missing", score: null, max: null },
      { key: "sprechen", status: "missing", score: null, max: null },
    ]);
  });

  it("(d) drill regression lock: moduleFilter:LESEN never touches recordOutcome or the simulation routes", async () => {
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

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/fr/app/examen/lesen/results"));

    expect(advanceSessionMock).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
    expect(useSimulationRun.getState().outcomes.lesen).toBeUndefined();
    expect(useSimulationRun.getState().result).toBeNull();
  });

  it("(e) advance rejection in the full-sim branch: shipped local-fallback catch still navigates to per-module results", async () => {
    submitLesenMock.mockResolvedValue({ attempt_id: "lesen-1", raw_score: 2 });
    advanceSessionMock.mockRejectedValue(new Error("network_error"));

    renderWithI18n(<LesenSessionScreen attemptId="lesen-1" mockAttemptId="mock-1" />);
    await goToLastItem();
    fireEvent.click(screen.getByTestId("lesen-session-submit"));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/fr/app/examen/lesen/results"));
    expect(replaceMock).not.toHaveBeenCalled();
    expect(finalizeSessionMock).not.toHaveBeenCalled();

    const payload = useLesenResultsStore.getState().payload;
    expect(payload?.submissionId).toMatch(/^local-/);
    // `recordOutcome` already ran (before the rejecting `advanceSession`
    // call) — this is the shipped ordering (brief interface note (a) runs
    // BEFORE `advanceSession`), so the outcome is still recorded even
    // though the chain-continuation redirect never fires.
    expect(useSimulationRun.getState().outcomes.lesen).toEqual({
      raw: 2,
      total: 2,
      unanswered: 0,
    });
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
