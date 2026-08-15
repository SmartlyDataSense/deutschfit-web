import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/learner/core/auth/useLearnerSession", () => ({
  useLearnerSession: { getState: () => ({ session: { user: { id: "u1" } } }) },
}));

import {
  __resetReadinessForTest,
  __setUserIdResolverForTest,
  getReadiness,
  markSubmissionInFlight,
} from "@/learner/core/readiness";
import {
  createSubmissionPoller,
  type PollSubmissionSnapshot,
} from "@/learner/core/submissions/usePollSubmission";

describe("createSubmissionPoller (mobile parity)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __resetReadinessForTest();
    __setUserIdResolverForTest(() => null); // skip Dexie writes in this suite
  });
  afterEach(() => vi.useRealTimers());

  it("schreiben polls at 2s, flips slow at 90s, lands ready on graded", async () => {
    markSubmissionInFlight("sub-1", "schreiben");
    let status = "pending";
    const fetchRow = vi.fn(async () => ({ id: "sub-1", status }) as never);
    const snapshots: PollSubmissionSnapshot[] = [];
    const poller = createSubmissionPoller({
      submissionId: "sub-1",
      module: "schreiben",
      onUpdate: (s) => snapshots.push(s),
      fetchRow,
      now: () => Date.now(),
    });
    poller.start();
    await vi.advanceTimersByTimeAsync(10); // first tick
    expect(fetchRow).toHaveBeenCalledWith("sub-1", "writing");
    await vi.advanceTimersByTimeAsync(2_000); // active cadence
    expect(fetchRow.mock.calls.length).toBeGreaterThanOrEqual(2);

    await vi.advanceTimersByTimeAsync(92_000); // past the 90s slow threshold
    expect(getReadiness()?.slow).toBe(true);
    expect(snapshots.at(-1)?.status).toBe("in-flight-slow");

    status = "graded";
    await vi.advanceTimersByTimeAsync(2_100);
    expect(getReadiness()?.state).toBe("ready");
    expect(snapshots.at(-1)?.status).toBe("graded");
    const calls = fetchRow.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000); // stopped — no more ticks
    expect(fetchRow.mock.calls.length).toBe(calls);
  });

  it("failed row lands markSubmissionFailed with the reaper hint", async () => {
    markSubmissionInFlight("sub-2", "sprechen");
    const fetchRow = vi.fn(
      async () => ({ id: "sub-2", status: "failed", failure_reason: "reaper-timeout" }) as never
    );
    const poller = createSubmissionPoller({
      submissionId: "sub-2",
      module: "sprechen",
      onUpdate: () => undefined,
      fetchRow,
    });
    poller.start();
    await vi.advanceTimersByTimeAsync(10);
    expect(getReadiness()).toMatchObject({ state: "failed", failedReason: "reaper-timeout" });
    expect(fetchRow).toHaveBeenCalledWith("sub-2", "speaking"); // sprechen → speaking kind hint
  });

  it("fetch errors keep the loop alive (snapshot.status === 'error')", async () => {
    markSubmissionInFlight("sub-3", "schreiben");
    const fetchRow = vi.fn().mockRejectedValue(new Error("boom"));
    const snapshots: PollSubmissionSnapshot[] = [];
    const poller = createSubmissionPoller({
      submissionId: "sub-3",
      module: "schreiben",
      onUpdate: (s) => snapshots.push(s),
      fetchRow,
    });
    poller.start();
    await vi.advanceTimersByTimeAsync(10);
    expect(snapshots.at(-1)).toMatchObject({ status: "error", error: "boom" });
    await vi.advanceTimersByTimeAsync(2_100);
    expect(fetchRow.mock.calls.length).toBeGreaterThanOrEqual(2);
    poller.stop();
  });
});
