import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `vi.hoisted` — `vi.mock` factories are hoisted above the rest of the
// module, so any mock fn they reference must be built via `vi.hoisted`, not
// a plain top-level `const` (same TDZ rationale as every other S4-S8 screen
// test in this suite, e.g. `learner-lesen-session.test.tsx`).
const {
  startSessionMock,
  readPendingMockExamMock,
  getMockAttemptMock,
  advanceSessionMock,
  finalizeSessionMock,
  listModelltestsMock,
  trackEventMock,
  pushMock,
  replaceMock,
  backMock,
  hydrateMock,
} = vi.hoisted(() => ({
  startSessionMock: vi.fn(),
  readPendingMockExamMock: vi.fn(),
  getMockAttemptMock: vi.fn(),
  advanceSessionMock: vi.fn(),
  finalizeSessionMock: vi.fn(),
  listModelltestsMock: vi.fn(),
  trackEventMock: vi.fn(),
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
  backMock: vi.fn(),
  hydrateMock: vi.fn(),
}));

// Partial mock: keep the real `nextModuleForStatus` (pure — no reason to
// fake it, screen imports it directly) and stub `getMockAttempt` +
// `listModelltests` (web#32's module-presence gate), same idiom as
// `learner-lesen-session.test.tsx`'s partial mocks.
vi.mock("@/learner/core/api/examApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/core/api/examApi")>();
  return {
    ...actual,
    getMockAttempt: (...args: unknown[]) => getMockAttemptMock(...args),
    listModelltests: (...args: unknown[]) => listModelltestsMock(...args),
  };
});
vi.mock("@/learner/core/exam/mockExamSession", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/core/exam/mockExamSession")>();
  return {
    ...actual,
    startSession: (...args: unknown[]) => startSessionMock(...args),
    readPendingMockExam: (...args: unknown[]) => readPendingMockExamMock(...args),
    advanceSession: (...args: unknown[]) => advanceSessionMock(...args),
    finalizeSession: (...args: unknown[]) => finalizeSessionMock(...args),
  };
});
vi.mock("@/learner/core/analytics/posthog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/core/analytics/posthog")>();
  return {
    ...actual,
    trackEvent: (...args: unknown[]) => trackEventMock(...args),
  };
});
vi.mock("@/learner/core/exam/examContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/core/exam/examContext")>();
  return { ...actual, hydrateExamContext: hydrateMock };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock, back: backMock }),
}));
vi.mock("next-intl", () => ({ useLocale: () => "fr" }));

import { initLearnerI18n } from "@/learner/core/i18n";
import { useLearnerSession } from "@/learner/core/auth/useLearnerSession";
import { useExamContextStore } from "@/learner/core/exam/examContext";
import { useSimulationRun } from "@/learner/core/exam/simulationRunStore";
import { SimulationOrchestratorScreen } from "@/learner/exam/screens/SimulationOrchestratorScreen";
import { renderWithI18n } from "./helpers/renderWithI18n";
import type { MockAttemptRow } from "@/learner/core/api/examApi";
import { ApiError } from "@/learner/core/api/client";

function attemptRow(
  overrides: Partial<MockAttemptRow> & { status: MockAttemptRow["status"] }
): MockAttemptRow {
  return {
    id: "mock-1",
    examSlug: "goethe-b1-01",
    lesenAttemptId: null,
    hoerenAttemptId: null,
    schreibenSubmissionId: null,
    sprechenSubmissionId: null,
    perCompetenceReport: null,
    startedAt: "2026-08-01T00:00:00.000Z",
    finalizedAt: null,
    ...overrides,
  };
}

/**
 * web#32 — every dispatch/resume test in this file boots against one of
 * these two slugs. Default `listModelltestsMock` resolution (below) tags
 * both as carrying every required module, so the module-presence gate is a
 * no-op for every pre-existing test; tests that need the OTHER branch
 * override per-module with `moduleAwareRows` / `mockResolvedValueOnce`.
 */
const MODULE_COMPLETE_SLUGS = ["goethe-b1-01", "telc-b1-07"] as const;

function moduleRows(slugs: readonly string[] = MODULE_COMPLETE_SLUGS, moduleCode = "LESEN") {
  return slugs.map((slug) => ({
    id: slug,
    slug,
    title: "Modelltest",
    cert_code: "GOETHE",
    level_code: "B1",
    short_label: null,
    sequence_num: null,
    module_code: moduleCode,
  }));
}

/**
 * final-review I-1 — drives `listModelltestsMock` off the `module` arg the
 * gate actually passes, so a test can say "this slug has LESEN but not
 * HOEREN". `slugsByModule` is keyed by module code; a module absent from
 * the map resolves to `MODULE_COMPLETE_SLUGS`.
 */
function moduleAwareRows(slugsByModule: Readonly<Record<string, readonly string[]>>) {
  return (args?: { module?: string }) => {
    const moduleCode = args?.module ?? "LESEN";
    return Promise.resolve(
      moduleRows(slugsByModule[moduleCode] ?? MODULE_COMPLETE_SLUGS, moduleCode)
    );
  };
}

describe("SimulationOrchestratorScreen — S8 Task 8.6 (boot, resume, dispatch)", () => {
  beforeEach(() => {
    startSessionMock.mockReset();
    readPendingMockExamMock.mockReset();
    getMockAttemptMock.mockReset();
    advanceSessionMock.mockReset();
    finalizeSessionMock.mockReset();
    trackEventMock.mockReset();
    pushMock.mockReset();
    replaceMock.mockReset();
    backMock.mockReset();
    hydrateMock.mockReset();
    listModelltestsMock.mockReset();
    readPendingMockExamMock.mockResolvedValue(null);
    // web#32 — default resolution tags both fixture slugs as carrying every
    // module in `FULL_SIMULATION_REQUIRED_MODULES`, so the module-presence
    // gate is a no-op for every pre-existing test.
    listModelltestsMock.mockImplementation(moduleAwareRows({}));
    useLearnerSession.setState({
      status: "authenticated",
      session: { user: { id: "u1" } },
    } as never);
    useExamContextStore.setState({ board: "goethe", level: "b1", isLoaded: true } as never);
    useSimulationRun.getState().clear();
  });
  afterEach(cleanup);

  it("fresh start: fires simulation_started once, begins the run, and replaces to the lesen session URL with examSlug + mockAttemptId + child id, no moduleFilter", async () => {
    startSessionMock.mockResolvedValue({
      mockAttemptId: "mock-1",
      examSlug: "goethe-b1-01",
      status: "in_progress",
      nextModule: "LESEN",
      lesenAttemptId: "lesen-attempt-1",
      hoerenAttemptId: null,
      resumed: false,
    });

    renderWithI18n(<SimulationOrchestratorScreen examSlug="goethe-b1-01" />);

    await waitFor(() => expect(replaceMock).toHaveBeenCalledTimes(1));

    expect(startSessionMock).toHaveBeenCalledWith({ userId: "u1", examSlug: "goethe-b1-01" });

    const url = replaceMock.mock.calls[0]?.[0] as string;
    expect(url).toBe(
      "/fr/app/examen/lesen/session?examSlug=goethe-b1-01&mockAttemptId=mock-1&attemptId=lesen-attempt-1"
    );
    expect(url).not.toContain("moduleFilter");

    expect(trackEventMock).toHaveBeenCalledWith("simulation_started", { board: "goethe" });
    expect(trackEventMock.mock.calls.filter((c) => c[0] === "simulation_started")).toHaveLength(1);

    expect(useSimulationRun.getState().examSlug).toBe("goethe-b1-01");
    expect(useSimulationRun.getState().mockAttemptId).toBe("mock-1");
  });

  it("fresh start under StrictMode: startSession and simulation_started each fire exactly once (double-invoke safe)", async () => {
    startSessionMock.mockResolvedValue({
      mockAttemptId: "mock-1",
      examSlug: "goethe-b1-01",
      status: "in_progress",
      nextModule: "LESEN",
      lesenAttemptId: "lesen-attempt-1",
      hoerenAttemptId: null,
      resumed: false,
    });

    const i18n = initLearnerI18n("fr");
    render(
      <I18nextProvider i18n={i18n}>
        <StrictMode>
          <SimulationOrchestratorScreen examSlug="goethe-b1-01" />
        </StrictMode>
      </I18nextProvider>
    );

    await waitFor(() => expect(replaceMock).toHaveBeenCalledTimes(1));
    expect(startSessionMock).toHaveBeenCalledTimes(1);
    expect(trackEventMock.mock.calls.filter((c) => c[0] === "simulation_started")).toHaveLength(1);
  });

  it("web#32: examSlug absent from the LESEN-filtered list renders the unavailable phase, never calls startSession, and the back CTA routes to the picker", async () => {
    // goethe-b1-01 carries no LESEN module.
    listModelltestsMock.mockImplementation(moduleAwareRows({ LESEN: ["telc-b1-07"] }));

    renderWithI18n(<SimulationOrchestratorScreen examSlug="goethe-b1-01" />);

    await waitFor(() =>
      expect(screen.getByTestId("simulation-orchestrator-unavailable")).toBeInTheDocument()
    );
    expect(startSessionMock).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
    // web#60 — `EmptyState` no longer has a default illustration at all
    // (the old 📖 default was outside the brand-voice emoji lock
    // `📍 ⏱ ✓ ✕`); this phase passes no `illustration`, so it renders none.
    expect(screen.getByTestId("simulation-orchestrator-unavailable").textContent).not.toContain(
      "\u{1F4D6}"
    );

    fireEvent.click(screen.getByTestId("simulation-orchestrator-unavailable-back"));
    expect(pushMock).toHaveBeenCalledWith("/fr/app/examen/modelltests");
  });

  /**
   * final-review I-1 — the gate must check EVERY module in
   * `FULL_SIMULATION_REQUIRED_MODULES`, not just LESEN. Revert the
   * orchestrator to the LESEN-only check and this test fails: `hasLesen`
   * is true, `startSession` runs, the learner gets routed into the Lesen
   * leg, and the chain later dead-ends at Hören's zero-part backstop in an
   * attempt the picker no longer offers a way back into.
   */
  it("web#32 / I-1: a slug with LESEN but no HOEREN is blocked BEFORE startSession, exactly like a LESEN-less slug", async () => {
    listModelltestsMock.mockImplementation(moduleAwareRows({ HOEREN: ["telc-b1-07"] }));

    renderWithI18n(<SimulationOrchestratorScreen examSlug="goethe-b1-01" />);

    await waitFor(() =>
      expect(screen.getByTestId("simulation-orchestrator-unavailable")).toBeInTheDocument()
    );
    expect(startSessionMock).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
    // The gate asked about every required module, not just LESEN.
    const askedModules = listModelltestsMock.mock.calls.map(
      (c) => (c[0] as { module?: string } | undefined)?.module
    );
    expect(askedModules).toEqual(expect.arrayContaining(["LESEN", "HOEREN", "SCHREIBEN"]));
  });

  it("web#32 / I-1: a slug with LESEN + HOEREN but no SCHREIBEN is blocked too (the whole set is required)", async () => {
    listModelltestsMock.mockImplementation(moduleAwareRows({ SCHREIBEN: ["telc-b1-07"] }));

    renderWithI18n(<SimulationOrchestratorScreen examSlug="goethe-b1-01" />);

    await waitFor(() =>
      expect(screen.getByTestId("simulation-orchestrator-unavailable")).toBeInTheDocument()
    );
    expect(startSessionMock).not.toHaveBeenCalled();
  });

  it("web#32: listModelltests rejecting fails OPEN — boot proceeds to startSession as if the module were present", async () => {
    listModelltestsMock.mockRejectedValueOnce(new Error("network_error"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    startSessionMock.mockResolvedValue({
      mockAttemptId: "mock-1",
      examSlug: "goethe-b1-01",
      status: "in_progress",
      nextModule: "LESEN",
      lesenAttemptId: "lesen-attempt-1",
      hoerenAttemptId: null,
      resumed: false,
    });

    renderWithI18n(<SimulationOrchestratorScreen examSlug="goethe-b1-01" />);

    await waitFor(() => expect(replaceMock).toHaveBeenCalledTimes(1));
    expect(startSessionMock).toHaveBeenCalledWith({ userId: "u1", examSlug: "goethe-b1-01" });
    expect(screen.queryByTestId("simulation-orchestrator-unavailable")).not.toBeInTheDocument();
    warnSpy.mockRestore();
  });

  it("resumed at lesen_done: replaces to the hoeren session URL with the row's hoeren attempt id, and does not fire simulation_started", async () => {
    startSessionMock.mockResolvedValue({
      mockAttemptId: "mock-1",
      examSlug: "goethe-b1-01",
      status: "lesen_done",
      nextModule: "HOEREN",
      lesenAttemptId: null,
      hoerenAttemptId: null,
      resumed: true,
    });
    getMockAttemptMock.mockResolvedValue(
      attemptRow({ status: "lesen_done", hoerenAttemptId: "hoeren-attempt-1" })
    );

    renderWithI18n(<SimulationOrchestratorScreen examSlug="goethe-b1-01" />);

    await waitFor(() => expect(replaceMock).toHaveBeenCalledTimes(1));

    const url = replaceMock.mock.calls[0]?.[0] as string;
    expect(url).toBe(
      "/fr/app/hoeren/session?examSlug=goethe-b1-01&mockAttemptId=mock-1&attemptId=hoeren-attempt-1"
    );
    expect(trackEventMock.mock.calls.filter((c) => c[0] === "simulation_started")).toHaveLength(0);
  });

  it("resumed at hoeren_done: dispatches to the schreiben gate phase (8.7 owns the real UI, shipped under testID simulation-schreiben-gate)", async () => {
    startSessionMock.mockResolvedValue({
      mockAttemptId: "mock-1",
      examSlug: "goethe-b1-01",
      status: "hoeren_done",
      nextModule: "SCHREIBEN",
      lesenAttemptId: null,
      hoerenAttemptId: null,
      resumed: true,
    });
    getMockAttemptMock.mockResolvedValue(attemptRow({ status: "hoeren_done" }));

    renderWithI18n(<SimulationOrchestratorScreen examSlug="goethe-b1-01" />);

    await waitFor(() =>
      expect(screen.getByTestId("simulation-schreiben-gate")).toBeInTheDocument()
    );
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("resumed at schreiben_done: dispatches to the finalizing phase, NEVER the error phase and NEVER a leg route (B1 recovery path — nextModuleForStatus returns SPRECHEN, any SPRECHEN dispatch means finalize)", async () => {
    startSessionMock.mockResolvedValue({
      mockAttemptId: "mock-1",
      examSlug: "goethe-b1-01",
      status: "schreiben_done",
      nextModule: "SPRECHEN",
      lesenAttemptId: null,
      hoerenAttemptId: null,
      resumed: true,
    });
    getMockAttemptMock.mockResolvedValue(attemptRow({ status: "schreiben_done" }));
    finalizeSessionMock.mockReturnValue(new Promise(() => {})); // hold — this test only asserts the phase transition, not finalize's outcome.

    renderWithI18n(<SimulationOrchestratorScreen examSlug="goethe-b1-01" />);

    await waitFor(() => expect(screen.getByTestId("simulation-finalizing")).toBeInTheDocument());
    expect(screen.queryByTestId("simulation-orchestrator-error")).not.toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("resumed with sprechen_done status (null nextModule): dispatches to the finalizing phase", async () => {
    startSessionMock.mockResolvedValue({
      mockAttemptId: "mock-1",
      examSlug: "goethe-b1-01",
      status: "sprechen_done",
      nextModule: null,
      lesenAttemptId: null,
      hoerenAttemptId: null,
      resumed: true,
    });
    getMockAttemptMock.mockResolvedValue(attemptRow({ status: "sprechen_done" }));
    finalizeSessionMock.mockReturnValue(new Promise(() => {})); // hold — this test only asserts the phase transition, not finalize's outcome.

    renderWithI18n(<SimulationOrchestratorScreen examSlug="goethe-b1-01" />);

    await waitFor(() => expect(screen.getByTestId("simulation-finalizing")).toBeInTheDocument());
  });

  it("resumed with abandoned status: dispatches to the error phase", async () => {
    startSessionMock.mockResolvedValue({
      mockAttemptId: "mock-1",
      examSlug: "goethe-b1-01",
      status: "abandoned",
      nextModule: null,
      lesenAttemptId: null,
      hoerenAttemptId: null,
      resumed: true,
    });
    getMockAttemptMock.mockResolvedValue(attemptRow({ status: "abandoned" }));

    renderWithI18n(<SimulationOrchestratorScreen examSlug="goethe-b1-01" />);

    await waitFor(() =>
      expect(screen.getByTestId("simulation-orchestrator-error")).toBeInTheDocument()
    );
  });

  it("resumed with getMockAttempt rejecting: dispatch still runs from the 409 handle's own status with no child attempt id, and warns loudly", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    startSessionMock.mockResolvedValue({
      mockAttemptId: "mock-1",
      examSlug: "goethe-b1-01",
      status: "lesen_done",
      nextModule: "HOEREN",
      lesenAttemptId: null,
      hoerenAttemptId: null,
      resumed: true,
    });
    getMockAttemptMock.mockRejectedValue(new Error("mock_attempt_read_failed"));

    renderWithI18n(<SimulationOrchestratorScreen examSlug="goethe-b1-01" />);

    await waitFor(() => expect(replaceMock).toHaveBeenCalledTimes(1));

    const url = replaceMock.mock.calls[0]?.[0] as string;
    expect(url).toBe("/fr/app/hoeren/session?examSlug=goethe-b1-01&mockAttemptId=mock-1");
    expect(url).not.toContain("attemptId=");
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("resumed with getMockAttempt rejecting AND the fallback dispatch landing on the schreiben gate: run identity is set before dispatch, so the skip CTA calls advanceSession instead of hitting the defensive missing-identity error (final-review I-2 — beginRun hoisted above the getMockAttempt try)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    startSessionMock.mockResolvedValue({
      mockAttemptId: "mock-1",
      examSlug: "goethe-b1-01",
      status: "hoeren_done",
      nextModule: "SCHREIBEN",
      lesenAttemptId: null,
      hoerenAttemptId: null,
      resumed: true,
    });
    getMockAttemptMock.mockRejectedValue(new Error("mock_attempt_read_failed"));
    advanceSessionMock.mockResolvedValue({
      mockAttemptId: "mock-1",
      examSlug: "goethe-b1-01",
      nextModule: null,
      finalizeRequired: true,
    });
    finalizeSessionMock.mockReturnValue(new Promise(() => {})); // isolate to the skip-CTA identity check itself.

    renderWithI18n(<SimulationOrchestratorScreen examSlug="goethe-b1-01" />);

    await waitFor(() =>
      expect(screen.getByTestId("simulation-schreiben-gate")).toBeInTheDocument()
    );
    // Run identity must already be set by the time the gate renders — this
    // is the assertion that would fail if `beginRun` were still called only
    // from the (unreachable, on this path) row-success branch.
    expect(useSimulationRun.getState().examSlug).toBe("goethe-b1-01");
    expect(useSimulationRun.getState().mockAttemptId).toBe("mock-1");

    fireEvent.click(screen.getByTestId("simulation-schreiben-skip"));

    await waitFor(() =>
      expect(advanceSessionMock).toHaveBeenCalledWith({
        userId: "u1",
        examSlug: "goethe-b1-01",
        mockAttemptId: "mock-1",
        finishedModule: "SCHREIBEN",
      })
    );
    // The defensive missing-identity branch never fires: no inline gate
    // error, and it never even reaches `advanceSession` on the broken path
    // (a missing identity short-circuits before the call).
    expect(screen.queryByTestId("simulation-schreiben-gate-error")).not.toBeInTheDocument();
    warnSpy.mockRestore();
  });

  it("resumed with getMockAttempt returning no row AND the fallback dispatch landing on the schreiben gate: run identity is set before dispatch, so the skip CTA calls advanceSession instead of hitting the defensive missing-identity error (final-review I-2)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    startSessionMock.mockResolvedValue({
      mockAttemptId: "mock-1",
      examSlug: "goethe-b1-01",
      status: "hoeren_done",
      nextModule: "SCHREIBEN",
      lesenAttemptId: null,
      hoerenAttemptId: null,
      resumed: true,
    });
    getMockAttemptMock.mockResolvedValue(null);
    advanceSessionMock.mockResolvedValue({
      mockAttemptId: "mock-1",
      examSlug: "goethe-b1-01",
      nextModule: null,
      finalizeRequired: true,
    });
    finalizeSessionMock.mockReturnValue(new Promise(() => {})); // isolate to the skip-CTA identity check itself.

    renderWithI18n(<SimulationOrchestratorScreen examSlug="goethe-b1-01" />);

    await waitFor(() =>
      expect(screen.getByTestId("simulation-schreiben-gate")).toBeInTheDocument()
    );
    expect(useSimulationRun.getState().examSlug).toBe("goethe-b1-01");
    expect(useSimulationRun.getState().mockAttemptId).toBe("mock-1");

    fireEvent.click(screen.getByTestId("simulation-schreiben-skip"));

    await waitFor(() =>
      expect(advanceSessionMock).toHaveBeenCalledWith({
        userId: "u1",
        examSlug: "goethe-b1-01",
        mockAttemptId: "mock-1",
        finishedModule: "SCHREIBEN",
      })
    );
    expect(screen.queryByTestId("simulation-schreiben-gate-error")).not.toBeInTheDocument();
    warnSpy.mockRestore();
  });

  it("no examSlug and no pending row: replaces to the examen hub", async () => {
    readPendingMockExamMock.mockResolvedValue(null);

    renderWithI18n(<SimulationOrchestratorScreen />);

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/fr/app/examen"));
    expect(startSessionMock).not.toHaveBeenCalled();
  });

  it("no examSlug with a pending row: adopts its modelltestSlug and boots against it", async () => {
    readPendingMockExamMock.mockResolvedValue({
      userId: "u1",
      modelltestSlug: "telc-b1-07",
      mockAttemptId: "mock-9",
      status: "in_progress",
      finalizedAt: null,
      updatedAt: 0,
    });
    startSessionMock.mockResolvedValue({
      mockAttemptId: "mock-9",
      examSlug: "telc-b1-07",
      status: "in_progress",
      nextModule: "LESEN",
      lesenAttemptId: "lesen-attempt-9",
      hoerenAttemptId: null,
      resumed: false,
    });

    renderWithI18n(<SimulationOrchestratorScreen />);

    await waitFor(() =>
      expect(startSessionMock).toHaveBeenCalledWith({ userId: "u1", examSlug: "telc-b1-07" })
    );
    await waitFor(() => expect(replaceMock).toHaveBeenCalledTimes(1));
    expect(replaceMock.mock.calls[0]?.[0] as string).toContain("examSlug=telc-b1-07");
  });

  it("boot failure (non-409 startSession rejection): renders the error phase, and clicking retry re-runs boot (guard-reset assertion — the retry only works because the one-shot ref resets on failure)", async () => {
    startSessionMock.mockRejectedValueOnce(new Error("network_error"));

    renderWithI18n(<SimulationOrchestratorScreen examSlug="goethe-b1-01" />);

    await waitFor(() =>
      expect(screen.getByTestId("simulation-orchestrator-error")).toBeInTheDocument()
    );
    expect(startSessionMock).toHaveBeenCalledTimes(1);

    startSessionMock.mockResolvedValueOnce({
      mockAttemptId: "mock-1",
      examSlug: "goethe-b1-01",
      status: "in_progress",
      nextModule: "LESEN",
      lesenAttemptId: "lesen-attempt-1",
      hoerenAttemptId: null,
      resumed: false,
    });

    fireEvent.click(screen.getByTestId("simulation-orchestrator-error-retry"));

    await waitFor(() => expect(startSessionMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(replaceMock).toHaveBeenCalledTimes(1));
  });

  it("error phase: back link routes to /examen", async () => {
    startSessionMock.mockRejectedValueOnce(new Error("network_error"));

    renderWithI18n(<SimulationOrchestratorScreen examSlug="goethe-b1-01" />);

    await waitFor(() =>
      expect(screen.getByTestId("simulation-orchestrator-error")).toBeInTheDocument()
    );

    fireEvent.click(screen.getByTestId("simulation-orchestrator-error-back"));
    expect(pushMock).toHaveBeenCalledWith("/fr/app/examen");
  });

  it("booting phase renders the shipped Skeleton primitive under the root testID, no invented loading copy", async () => {
    startSessionMock.mockImplementation(() => new Promise(() => {}));

    renderWithI18n(<SimulationOrchestratorScreen examSlug="goethe-b1-01" />);

    expect(screen.getByTestId("simulation-orchestrator")).toBeInTheDocument();
    expect(screen.getByTestId("simulation-orchestrator-booting")).toBeInTheDocument();
  });

  it("does not boot until the exam context has hydrated", async () => {
    useExamContextStore.setState({ board: "goethe", level: "b1", isLoaded: false } as never);

    renderWithI18n(<SimulationOrchestratorScreen examSlug="goethe-b1-01" />);

    await waitFor(() => expect(hydrateMock).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(startSessionMock).not.toHaveBeenCalled();

    act(() => {
      useExamContextStore.setState({ board: "goethe", level: "b1", isLoaded: true } as never);
    });

    await waitFor(() => expect(startSessionMock).toHaveBeenCalledTimes(1));
  });
});

// The exact backend default `per_competence_report` shape
// (`mock-exam-finalize/index.ts:135-139`): schreiben has no linked
// submission → "missing"; sprechen is always deferred (Phase 9, no
// Sprechen leg exists yet) — never a pretend grade for either.
const DEFAULT_FINALIZE_REPORT = {
  lesen: { status: "missing" as const },
  hoeren: { status: "missing" as const },
  schreiben: { status: "missing" as const },
  sprechen: { status: "deferred" as const },
};

async function bootToSchreibenGate(): Promise<void> {
  startSessionMock.mockResolvedValue({
    mockAttemptId: "mock-1",
    examSlug: "goethe-b1-01",
    status: "hoeren_done",
    nextModule: "SCHREIBEN",
    lesenAttemptId: null,
    hoerenAttemptId: null,
    resumed: true,
  });
  getMockAttemptMock.mockResolvedValue(attemptRow({ status: "hoeren_done" }));

  renderWithI18n(<SimulationOrchestratorScreen examSlug="goethe-b1-01" />);

  await waitFor(() => expect(screen.getByTestId("simulation-schreiben-gate")).toBeInTheDocument());
}

describe("SimulationOrchestratorScreen — S8 Task 8.7 (schreiben gate + finalize)", () => {
  beforeEach(() => {
    startSessionMock.mockReset();
    readPendingMockExamMock.mockReset();
    getMockAttemptMock.mockReset();
    advanceSessionMock.mockReset();
    finalizeSessionMock.mockReset();
    trackEventMock.mockReset();
    pushMock.mockReset();
    replaceMock.mockReset();
    backMock.mockReset();
    hydrateMock.mockReset();
    listModelltestsMock.mockReset();
    readPendingMockExamMock.mockResolvedValue(null);
    // web#32 — default resolution tags both fixture slugs as carrying every
    // module in `FULL_SIMULATION_REQUIRED_MODULES`, so the module-presence
    // gate is a no-op for every pre-existing test.
    listModelltestsMock.mockImplementation(moduleAwareRows({}));
    useLearnerSession.setState({
      status: "authenticated",
      session: { user: { id: "u1" } },
    } as never);
    useExamContextStore.setState({ board: "goethe", level: "b1", isLoaded: true } as never);
    useSimulationRun.getState().clear();
  });
  afterEach(cleanup);

  it("gate renders the unsupportedDrill copy + the schreiben module header, and NEVER a score or a text input (honesty)", async () => {
    // Held pending — this test only asserts the gate's own DOM, not the
    // finalize chain that a click would trigger.
    finalizeSessionMock.mockReturnValue(new Promise(() => {}));

    await bootToSchreibenGate();

    expect(screen.getByText("Schreiben · Préparation par module")).toBeInTheDocument();
    expect(
      screen.getByText("Choisis un modelltest pour t'entraîner uniquement sur l'expression écrite.")
    ).toBeInTheDocument();
    expect(screen.getByText("Bientôt disponible")).toBeInTheDocument();
    expect(screen.getByText("Ce mode arrive bientôt pour ce module.")).toBeInTheDocument();

    // Honesty assertions — no fake grade, no text-entry surface.
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(document.querySelector("textarea")).not.toBeInTheDocument();
    expect(screen.queryByText(/\d+\s*\/\s*\d+/)).not.toBeInTheDocument();

    expect(screen.getByTestId("simulation-schreiben-skip")).toHaveTextContent("Continuer");
  });

  it("skip CTA calls advanceSession with finishedModule SCHREIBEN exactly once under a synchronous double-click, then moves to finalizing", async () => {
    const deferred = (() => {
      let resolve!: (v: unknown) => void;
      const promise = new Promise((r) => (resolve = r));
      return { promise, resolve };
    })();
    advanceSessionMock.mockReturnValue(deferred.promise);
    finalizeSessionMock.mockReturnValue(new Promise(() => {})); // isolate this test to the advance call.

    await bootToSchreibenGate();

    const skip = screen.getByTestId("simulation-schreiben-skip");
    fireEvent.click(skip);
    fireEvent.click(skip); // second click while the first advance is still in flight (re-entrancy)

    expect(advanceSessionMock).toHaveBeenCalledTimes(1);
    expect(advanceSessionMock).toHaveBeenCalledWith({
      userId: "u1",
      examSlug: "goethe-b1-01",
      mockAttemptId: "mock-1",
      finishedModule: "SCHREIBEN",
    });

    await act(async () => {
      deferred.resolve({
        mockAttemptId: "mock-1",
        examSlug: "goethe-b1-01",
        nextModule: null,
        finalizeRequired: true,
      });
    });

    await waitFor(() => expect(screen.getByTestId("simulation-finalizing")).toBeInTheDocument());
    expect(trackEventMock).toHaveBeenCalledWith("exam_advance", {
      attempt_id: "mock-1",
      finished_module: "SCHREIBEN",
      next_module: null,
    });
  });

  it("advanceSession rejecting with a state_mismatch 409 whose current_status is schreiben_done falls forward to finalizing without ever showing an error", async () => {
    advanceSessionMock.mockRejectedValueOnce(
      new ApiError(409, "state_mismatch", undefined, {
        error: "state_mismatch",
        current_status: "schreiben_done",
      })
    );
    finalizeSessionMock.mockReturnValue(new Promise(() => {})); // isolate to the fall-forward transition itself.

    await bootToSchreibenGate();

    fireEvent.click(screen.getByTestId("simulation-schreiben-skip"));

    await waitFor(() => expect(screen.getByTestId("simulation-finalizing")).toBeInTheDocument());
    expect(screen.queryByTestId("simulation-orchestrator-error")).not.toBeInTheDocument();
    expect(screen.queryByTestId("simulation-schreiben-gate-error")).not.toBeInTheDocument();
  });

  it("finalizing calls finalizeSession exactly once even under StrictMode double-invoke, writes the server report verbatim into the run store (schreiben missing, sprechen deferred), and replaces to the results route", async () => {
    startSessionMock.mockResolvedValue({
      mockAttemptId: "mock-1",
      examSlug: "goethe-b1-01",
      status: "schreiben_done",
      nextModule: "SPRECHEN",
      lesenAttemptId: null,
      hoerenAttemptId: null,
      resumed: true,
    });
    getMockAttemptMock.mockResolvedValue(attemptRow({ status: "schreiben_done" }));
    finalizeSessionMock.mockResolvedValue({
      mockAttemptId: "mock-1",
      status: "finalized",
      finalizedAt: "2026-08-09T12:00:00.000Z",
      perCompetenceReport: DEFAULT_FINALIZE_REPORT,
      replay: false,
    });

    const i18n = initLearnerI18n("fr");
    render(
      <I18nextProvider i18n={i18n}>
        <StrictMode>
          <SimulationOrchestratorScreen examSlug="goethe-b1-01" />
        </StrictMode>
      </I18nextProvider>
    );

    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith("/fr/app/examen/simulation/results")
    );
    expect(finalizeSessionMock).toHaveBeenCalledTimes(1);
    expect(finalizeSessionMock).toHaveBeenCalledWith({
      userId: "u1",
      examSlug: "goethe-b1-01",
      mockAttemptId: "mock-1",
    });
    expect(trackEventMock).toHaveBeenCalledWith("exam_finalized", { attempt_id: "mock-1" });

    const result = useSimulationRun.getState().result;
    expect(result?.finalizedAt).toBe("2026-08-09T12:00:00.000Z");
    expect(result?.skills).toHaveLength(4);
    expect(result?.skills.find((s) => s.key === "schreiben")?.status).toBe("missing");
    expect(result?.skills.find((s) => s.key === "sprechen")?.status).toBe("deferred");
  });

  it("finalizing accepts a replay:true response the same way as a fresh 200 (idempotent replay)", async () => {
    startSessionMock.mockResolvedValue({
      mockAttemptId: "mock-1",
      examSlug: "goethe-b1-01",
      status: "sprechen_done",
      nextModule: null,
      lesenAttemptId: null,
      hoerenAttemptId: null,
      resumed: true,
    });
    getMockAttemptMock.mockResolvedValue(attemptRow({ status: "sprechen_done" }));
    finalizeSessionMock.mockResolvedValue({
      mockAttemptId: "mock-1",
      status: "finalized",
      finalizedAt: "2026-08-09T12:00:00.000Z",
      perCompetenceReport: DEFAULT_FINALIZE_REPORT,
      replay: true,
    });

    renderWithI18n(<SimulationOrchestratorScreen examSlug="goethe-b1-01" />);

    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith("/fr/app/examen/simulation/results")
    );
    expect(useSimulationRun.getState().result?.skills).toHaveLength(4);
  });

  it("finalize rejection renders the shared error phase, and retry re-runs boot then finalize successfully", async () => {
    startSessionMock.mockResolvedValueOnce({
      mockAttemptId: "mock-1",
      examSlug: "goethe-b1-01",
      status: "schreiben_done",
      nextModule: "SPRECHEN",
      lesenAttemptId: null,
      hoerenAttemptId: null,
      resumed: true,
    });
    getMockAttemptMock.mockResolvedValue(attemptRow({ status: "schreiben_done" }));
    finalizeSessionMock.mockRejectedValueOnce(new Error("network_error"));

    renderWithI18n(<SimulationOrchestratorScreen examSlug="goethe-b1-01" />);

    await waitFor(() =>
      expect(screen.getByTestId("simulation-orchestrator-error")).toBeInTheDocument()
    );
    expect(finalizeSessionMock).toHaveBeenCalledTimes(1);

    startSessionMock.mockResolvedValueOnce({
      mockAttemptId: "mock-1",
      examSlug: "goethe-b1-01",
      status: "schreiben_done",
      nextModule: "SPRECHEN",
      lesenAttemptId: null,
      hoerenAttemptId: null,
      resumed: true,
    });
    finalizeSessionMock.mockResolvedValueOnce({
      mockAttemptId: "mock-1",
      status: "finalized",
      finalizedAt: "2026-08-09T12:00:00.000Z",
      perCompetenceReport: DEFAULT_FINALIZE_REPORT,
      replay: false,
    });

    fireEvent.click(screen.getByTestId("simulation-orchestrator-error-retry"));

    await waitFor(() => expect(finalizeSessionMock).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith("/fr/app/examen/simulation/results")
    );
  });

  it("gate and finalizing both render a back-to-/examen ghost link (escape hatch)", async () => {
    finalizeSessionMock.mockReturnValue(new Promise(() => {}));
    await bootToSchreibenGate();

    fireEvent.click(screen.getByTestId("simulation-schreiben-gate-back"));
    expect(pushMock).toHaveBeenCalledWith("/fr/app/examen");
  });
});
