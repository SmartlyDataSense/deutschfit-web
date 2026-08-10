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
  trackEventMock,
  pushMock,
  replaceMock,
  backMock,
  hydrateMock,
} = vi.hoisted(() => ({
  startSessionMock: vi.fn(),
  readPendingMockExamMock: vi.fn(),
  getMockAttemptMock: vi.fn(),
  trackEventMock: vi.fn(),
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
  backMock: vi.fn(),
  hydrateMock: vi.fn(),
}));

// Partial mock: keep the real `nextModuleForStatus` (pure — no reason to
// fake it, screen imports it directly) and stub `getMockAttempt`, same
// idiom as `learner-lesen-session.test.tsx`'s partial mocks.
vi.mock("@/learner/core/api/examApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/core/api/examApi")>();
  return {
    ...actual,
    getMockAttempt: (...args: unknown[]) => getMockAttemptMock(...args),
  };
});
vi.mock("@/learner/core/exam/mockExamSession", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/core/exam/mockExamSession")>();
  return {
    ...actual,
    startSession: (...args: unknown[]) => startSessionMock(...args),
    readPendingMockExam: (...args: unknown[]) => readPendingMockExamMock(...args),
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

describe("SimulationOrchestratorScreen — S8 Task 8.6 (boot, resume, dispatch)", () => {
  beforeEach(() => {
    startSessionMock.mockReset();
    readPendingMockExamMock.mockReset();
    getMockAttemptMock.mockReset();
    trackEventMock.mockReset();
    pushMock.mockReset();
    replaceMock.mockReset();
    backMock.mockReset();
    hydrateMock.mockReset();
    readPendingMockExamMock.mockResolvedValue(null);
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

  it("resumed at hoeren_done: dispatches to the schreiben gate phase (8.7 owns the real UI; this task ships the placeholder region)", async () => {
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
      expect(screen.getByTestId("simulation-orchestrator-schreiben-gate")).toBeInTheDocument()
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

    renderWithI18n(<SimulationOrchestratorScreen examSlug="goethe-b1-01" />);

    await waitFor(() =>
      expect(screen.getByTestId("simulation-orchestrator-finalizing")).toBeInTheDocument()
    );
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

    renderWithI18n(<SimulationOrchestratorScreen examSlug="goethe-b1-01" />);

    await waitFor(() =>
      expect(screen.getByTestId("simulation-orchestrator-finalizing")).toBeInTheDocument()
    );
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
