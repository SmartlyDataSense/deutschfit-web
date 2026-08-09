import { beforeEach, describe, expect, it } from "vitest";

import { useSimulationRun } from "@/learner/core/exam/simulationRunStore";

describe("useSimulationRun", () => {
  beforeEach(() => {
    useSimulationRun.getState().clear();
  });

  it("beginRun seeds identity and starts with empty outcomes/result", () => {
    const s = () => useSimulationRun.getState();
    s().beginRun("goethe-b1-01", "attempt-1");
    expect(s().examSlug).toBe("goethe-b1-01");
    expect(s().mockAttemptId).toBe("attempt-1");
    expect(s().outcomes).toEqual({});
    expect(s().durationMinutesTotal).toBe(0);
    expect(s().result).toBeNull();
  });

  it("beginRun with a different attempt id resets an already-populated run", () => {
    const s = () => useSimulationRun.getState();
    s().beginRun("goethe-b1-01", "attempt-1");
    s().recordOutcome("lesen", { raw: 8, total: 10, unanswered: 1 }, 20);
    s().setResult({ report: {}, skills: [], finalizedAt: "2026-08-10T00:00:00Z" });

    s().beginRun("goethe-b1-02", "attempt-2");

    expect(s().examSlug).toBe("goethe-b1-02");
    expect(s().mockAttemptId).toBe("attempt-2");
    expect(s().outcomes).toEqual({});
    expect(s().durationMinutesTotal).toBe(0);
    expect(s().result).toBeNull();
  });

  it("beginRun with the SAME attempt id is a no-op — chain re-entry must not wipe an accumulated outcome", () => {
    const s = () => useSimulationRun.getState();
    s().beginRun("goethe-b1-01", "attempt-1");
    s().recordOutcome("lesen", { raw: 8, total: 10, unanswered: 1 }, 20);

    // Orchestrator re-entry (StrictMode double-invoke / remount) landing on
    // the identical attempt id — the already-recorded lesen leg must survive.
    s().beginRun("goethe-b1-01", "attempt-1");

    expect(s().outcomes.lesen).toEqual({ raw: 8, total: 10, unanswered: 1 });
    expect(s().durationMinutesTotal).toBe(20);
  });

  it("recordOutcome accumulates durationMinutesTotal across legs and keys outcomes by module", () => {
    const s = () => useSimulationRun.getState();
    s().beginRun("goethe-b1-01", "attempt-1");
    s().recordOutcome("lesen", { raw: 8, total: 10, unanswered: 1 }, 20);
    s().recordOutcome("hoeren", { raw: 6, total: 10, unanswered: 0 }, 15);

    expect(s().outcomes).toEqual({
      lesen: { raw: 8, total: 10, unanswered: 1 },
      hoeren: { raw: 6, total: 10, unanswered: 0 },
    });
    expect(s().durationMinutesTotal).toBe(35);
  });

  it("setResult stores the finalize payload verbatim", () => {
    const s = () => useSimulationRun.getState();
    s().beginRun("goethe-b1-01", "attempt-1");
    const result = {
      report: { lesen: { status: "scored" } },
      skills: [],
      finalizedAt: "2026-08-10T00:00:00Z",
    };
    s().setResult(result);
    expect(s().result).toEqual(result);
  });

  it("clear empties the whole store back to its initial state", () => {
    const s = () => useSimulationRun.getState();
    s().beginRun("goethe-b1-01", "attempt-1");
    s().recordOutcome("lesen", { raw: 8, total: 10, unanswered: 1 }, 20);
    s().setResult({ report: {}, skills: [], finalizedAt: "2026-08-10T00:00:00Z" });

    s().clear();

    expect(s().examSlug).toBeNull();
    expect(s().mockAttemptId).toBeNull();
    expect(s().outcomes).toEqual({});
    expect(s().durationMinutesTotal).toBe(0);
    expect(s().result).toBeNull();
  });
});
