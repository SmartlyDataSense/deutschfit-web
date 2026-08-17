import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `vi.hoisted` — `vi.mock` factories are hoisted above the rest of the
// module, so any mock fn/state they reference must be built via
// `vi.hoisted`, not a plain top-level `const` (same TDZ rationale as every
// other S4-S8 screen test in this suite).
const { pushMock, hydrateMock, readPendingMockExamMock, trackEventMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  hydrateMock: vi.fn(),
  readPendingMockExamMock: vi.fn(),
  trackEventMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));
vi.mock("next-intl", () => ({ useLocale: () => "fr" }));
vi.mock("@/learner/core/analytics/posthog", () => ({
  trackEvent: (...args: unknown[]) => trackEventMock(...args),
}));
// Partial mock: keep the real `useExamContextStore` (tests drive it
// directly via `setState`) but stub `hydrateExamContext` so the screen's
// self-hydrate mount effect doesn't hit real localStorage/Supabase in
// jsdom — same idiom as `learner-schreiben-prompt-list.test.tsx`.
vi.mock("@/learner/core/exam/examContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/core/exam/examContext")>();
  return { ...actual, hydrateExamContext: hydrateMock };
});
// Only mock `readPendingMockExam` on this module — the facade re-exports
// underneath it (`startSession`, etc.) are untouched and unused by this
// screen.
vi.mock("@/learner/core/exam/mockExamSession", () => ({
  readPendingMockExam: (...args: unknown[]) => readPendingMockExamMock(...args),
}));

import { initLearnerI18n } from "@/learner/core/i18n";
import { useExamContextStore } from "@/learner/core/exam/examContext";
import { useLearnerSession } from "@/learner/core/auth/useLearnerSession";
import type { MockExamCacheRecord } from "@/learner/core/exam/mockExamSession";
import { ExamHomeScreen } from "@/learner/exam/screens/ExamHomeScreen";
import { renderWithI18n } from "./helpers/renderWithI18n";

function pendingRow(overrides: Partial<MockExamCacheRecord> = {}): MockExamCacheRecord {
  return {
    userId: "u1",
    modelltestSlug: "goethe-b1-modell-1",
    mockAttemptId: "attempt-42",
    status: "in_progress",
    finalizedAt: null,
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe("ExamHomeScreen — S8 Task 8.3 (track badge, resume card, module + simulation cards)", () => {
  beforeEach(() => {
    pushMock.mockReset();
    hydrateMock.mockReset();
    readPendingMockExamMock.mockReset();
    readPendingMockExamMock.mockResolvedValue(null);
    trackEventMock.mockReset();
    useExamContextStore.setState({ board: "goethe", level: "b1", isLoaded: true } as never);
    useLearnerSession.setState({
      status: "authenticated",
      session: { user: { id: "u1" } },
    } as never);
  });
  afterEach(cleanup);

  it("no pending row: no resume card renders, and readPendingMockExam fires exactly once under StrictMode double-render (guard-removal-verified)", async () => {
    renderWithI18n(
      <StrictMode>
        <ExamHomeScreen />
      </StrictMode>
    );

    await waitFor(() => expect(readPendingMockExamMock).toHaveBeenCalledTimes(1));
    // Give any extra (incorrect) invocation a chance to fire before
    // asserting the count stays at 1 — this is what fails if the one-shot
    // ref guard is removed from the screen's fetch effect.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(readPendingMockExamMock).toHaveBeenCalledTimes(1);
    expect(readPendingMockExamMock).toHaveBeenCalledWith("u1");
    expect(screen.queryByTestId("examHome.resume")).not.toBeInTheDocument();
  });

  it('pending row: resume card renders resume.* copy, routes to the simulation URL with the row\'s slug, and fires exam_home_card_tapped {card:"resume"}', async () => {
    readPendingMockExamMock.mockResolvedValue(pendingRow());
    renderWithI18n(<ExamHomeScreen />);

    await waitFor(() => expect(screen.getByTestId("examHome.resume")).toBeInTheDocument());
    expect(screen.getByTestId("examHome.resume").textContent).toContain("Reprendre l'examen blanc");
    expect(screen.getByTestId("examHome.resume").textContent).toContain(
      "Tu as un examen blanc en cours."
    );
    expect(screen.getByTestId("examHome.resume").getAttribute("aria-label")).toBe(
      "Reprendre l'examen blanc en cours"
    );

    fireEvent.click(screen.getByTestId("examHome.resume"));

    expect(trackEventMock).toHaveBeenCalledWith("exam_home_card_tapped", { card: "resume" });
    expect(pushMock).toHaveBeenCalledWith("/fr/app/examen/simulation?examSlug=goethe-b1-modell-1");
  });

  it("web#38 pin: under StrictMode's dev double-invoke, a resolved pending row still lands in state and the resume card renders (isMountedRef guard-removal-verified)", async () => {
    // Regression for the cleanup-only `isMountedRef` trap: an effect whose
    // only job is `return () => { isMountedRef.current = false; }` never
    // resets the ref back to `true` on the second (post-cleanup) setup that
    // StrictMode's dev double-invoke runs synchronously on mount. The ref
    // is then permanently `false` for the rest of the component's life, so
    // `if (isMountedRef.current) setPending(row)` silently drops the async
    // `readPendingMockExam` resolution below and the resume card never
    // renders — even though nothing actually unmounted. A test that isn't
    // wrapped in `<StrictMode>` (the "pending row" test above) cannot catch
    // this: without the double-invoke, the ref's initial `true` value is
    // never touched before the promise resolves, so it passes against both
    // the broken and the fixed effect.
    //
    // Deliberately NOT using the shared `renderWithI18n` helper: it wraps
    // `<I18nextProvider>` OUTSIDE the tree it's given, so
    // `renderWithI18n(<StrictMode>...)` nests as
    // `I18nextProvider > StrictMode > ExamHomeScreen`. Empirically verified
    // (React 19.1.0 / this jsdom+vitest setup) that a Context.Provider
    // *outside* `<StrictMode>` suppresses the dev mount double-invoke for
    // every descendant effect — `<StrictMode>` must be the OUTERMOST
    // element for the double-invoke to actually fire. Rendered directly
    // here with the order flipped (`StrictMode > I18nextProvider > …`) so
    // this test exercises the real trap instead of silently no-op'ing.
    readPendingMockExamMock.mockResolvedValue(pendingRow());
    const i18n = initLearnerI18n("fr");
    render(
      <StrictMode>
        <I18nextProvider i18n={i18n}>
          <ExamHomeScreen />
        </I18nextProvider>
      </StrictMode>
    );

    await waitFor(() => expect(screen.getByTestId("examHome.resume")).toBeInTheDocument());
    expect(screen.getByTestId("examHome.resume").textContent).toContain("Reprendre l'examen blanc");
  });

  it("rejected readPendingMockExam: cards still render (resume is best-effort); guard resets so a later legitimate re-run can retry and show the card", async () => {
    readPendingMockExamMock.mockRejectedValueOnce(new Error("dexie_unavailable"));
    renderWithI18n(<ExamHomeScreen />);

    await waitFor(() => expect(readPendingMockExamMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("examHome.resume")).not.toBeInTheDocument();
    // Best-effort — the module/simulation cards still render despite the
    // failed pending-scan.
    expect(screen.getByTestId("examHome.card.lesen")).toBeInTheDocument();
    expect(screen.getByTestId("examHome.card.hoeren")).toBeInTheDocument();
    expect(screen.getByTestId("examHome.card.simulation")).toBeInTheDocument();

    // A legitimate re-run of the fetch effect (e.g. the session resolving a
    // fresh user id) must not be permanently blocked by the failed first
    // attempt — the guard reset in the catch branch is exactly what makes
    // this possible.
    readPendingMockExamMock.mockResolvedValueOnce(pendingRow({ userId: "u1-b" }));
    act(() => {
      useLearnerSession.setState({
        status: "authenticated",
        session: { user: { id: "u1-b" } },
      } as never);
    });

    await waitFor(() => expect(readPendingMockExamMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId("examHome.resume")).toBeInTheDocument());
  });

  it("value-keyed guard: a SUCCESSFUL scan for user A does not permanently block a later scan when userId changes to user B while mounted", async () => {
    // Regression for a plain-boolean one-shot ref (`fetchedRef = useRef(false)`):
    // once a scan succeeds, a boolean guard sticks `true` forever, so a
    // later genuine `userId` change (the effect's own declared dependency)
    // would never re-trigger the scan. The guard must be keyed to the
    // `userId` it last ran for (mirrors `FeedbackScreen.tsx`'s
    // `fetchedPromptIdRef` idiom) so a real user swap always gets a fresh
    // attempt — independent of the failure-reset branch exercised above.
    readPendingMockExamMock.mockResolvedValueOnce(null);
    renderWithI18n(<ExamHomeScreen />);

    await waitFor(() => expect(readPendingMockExamMock).toHaveBeenCalledTimes(1));
    expect(readPendingMockExamMock).toHaveBeenCalledWith("u1");
    expect(screen.queryByTestId("examHome.resume")).not.toBeInTheDocument();

    readPendingMockExamMock.mockResolvedValueOnce(pendingRow({ userId: "u2" }));
    act(() => {
      useLearnerSession.setState({
        status: "authenticated",
        session: { user: { id: "u2" } },
      } as never);
    });

    await waitFor(() => expect(readPendingMockExamMock).toHaveBeenCalledTimes(2));
    expect(readPendingMockExamMock).toHaveBeenLastCalledWith("u2");
    await waitFor(() => expect(screen.getByTestId("examHome.resume")).toBeInTheDocument());
  });

  it("three module/simulation cards render locale copy, route correctly, and each fire their own catalogued event", async () => {
    renderWithI18n(<ExamHomeScreen />);

    await waitFor(() => expect(readPendingMockExamMock).toHaveBeenCalledTimes(1));

    const lesenCard = screen.getByTestId("examHome.card.lesen");
    expect(lesenCard.textContent).toContain("Lesen");
    expect(lesenCard.textContent).toContain("Compréhension écrite — Teile 1 à 5.");
    fireEvent.click(lesenCard);
    expect(trackEventMock).toHaveBeenCalledWith("exam_home_card_tapped", {
      card: "module",
      module: "LESEN",
    });
    expect(pushMock).toHaveBeenCalledWith("/fr/app/examen/lesen");

    const hoerenCard = screen.getByTestId("examHome.card.hoeren");
    expect(hoerenCard.textContent).toContain("Hören");
    expect(hoerenCard.textContent).toContain("Compréhension orale — Teile 1 à 4.");
    fireEvent.click(hoerenCard);
    expect(trackEventMock).toHaveBeenCalledWith("exam_home_card_tapped", {
      card: "module",
      module: "HOEREN",
    });
    expect(pushMock).toHaveBeenCalledWith("/fr/app/examen/hoeren");

    const simulationCard = screen.getByTestId("examHome.card.simulation");
    expect(simulationCard.textContent).toContain("Simulation complète");
    expect(simulationCard.textContent).toContain("Playbook B1 — timing réel, MCQ + stimulus.");
    fireEvent.click(simulationCard);
    expect(trackEventMock).toHaveBeenCalledWith("exam_home_card_tapped", {
      card: "full_simulation",
    });
    expect(pushMock).toHaveBeenCalledWith("/fr/app/examen/modelltests");
  });

  it("renders the track badge + home title/subtitle copy and does NOT render the mobile WIP hero", async () => {
    renderWithI18n(<ExamHomeScreen />);

    await waitFor(() => expect(readPendingMockExamMock).toHaveBeenCalledTimes(1));

    expect(screen.getByTestId("examHome")).toBeInTheDocument();
    expect(screen.getByText("B1")).toBeInTheDocument();
    expect(screen.getByText("Examen")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Le module Examen arrive bientôt. En attendant, continue à progresser sur Sprechen, Schreiben et avec ton Betreuer."
      )
    ).toBeInTheDocument();

    // Web delta (P13) — the mobile WIP hero ("bientôt disponible") is
    // deliberately dropped from this screen.
    expect(screen.queryByTestId("examHome.hero")).not.toBeInTheDocument();
    expect(screen.queryByText("Examen — bientôt disponible")).not.toBeInTheDocument();
  });

  it("hydration gate: nothing pending-cache-dependent renders until the exam-context store isLoaded flips true", async () => {
    useExamContextStore.setState({ board: "goethe", level: "b1", isLoaded: false } as never);

    renderWithI18n(<ExamHomeScreen />);

    await waitFor(() => expect(hydrateMock).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(readPendingMockExamMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId("examHome.card.lesen")).not.toBeInTheDocument();

    act(() => {
      useExamContextStore.setState({ board: "goethe", level: "b1", isLoaded: true } as never);
    });

    await waitFor(() => expect(readPendingMockExamMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId("examHome.card.lesen")).toBeInTheDocument());
  });
});

describe("Examen route — placeholder replaced", () => {
  it("the `examen-empty-state` placeholder testID is gone from the exam home render tree", async () => {
    renderWithI18n(<ExamHomeScreen />);
    await waitFor(() => expect(screen.getByTestId("examHome")).toBeInTheDocument());
    expect(screen.queryByTestId("examen-empty-state")).not.toBeInTheDocument();
  });
});
