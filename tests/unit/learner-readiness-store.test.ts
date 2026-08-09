import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/learner/core/auth/useLearnerSession", () => ({
  useLearnerSession: { getState: () => ({ session: { user: { id: "u1" } } }) },
}));

import { __resetLearnerDbForTests, getLearnerDb } from "@/learner/core/db";
import {
  __resetReadinessForTest,
  __setUserIdResolverForTest,
  acknowledgeReadiness,
  clearReadiness,
  getReadiness,
  isSubmissionAllowed,
  markCorrectionLong,
  markCorrectionReady,
  markSubmissionFailed,
  markSubmissionInFlight,
  registerAcknowledgeHook,
  registerReadyHook,
  subscribeReadiness,
} from "@/learner/core/readiness";

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("readiness single-slot machine (mobile parity)", () => {
  beforeEach(() => {
    __resetReadinessForTest();
    __resetLearnerDbForTests();
    __setUserIdResolverForTest(() => "u1");
  });

  it("in-flight → ready → acknowledge lifecycle with idempotent re-emits", async () => {
    const seen: unknown[] = [];
    subscribeReadiness((s) => seen.push(s));

    markSubmissionInFlight("sub-1", "schreiben");
    expect(getReadiness()).toMatchObject({ submissionId: "sub-1", state: "in-flight" });
    markSubmissionInFlight("sub-1", "schreiben"); // idempotent no-op
    expect(seen).toHaveLength(1);

    markCorrectionLong("sub-1");
    expect(getReadiness()?.slow).toBe(true);
    markCorrectionLong("sub-1"); // idempotent
    expect(seen).toHaveLength(2);

    const readyHook = vi.fn();
    registerReadyHook(readyHook);
    markCorrectionReady("sub-1");
    expect(getReadiness()).toMatchObject({ state: "ready", slow: undefined });
    expect(readyHook).toHaveBeenCalledTimes(1);
    markCorrectionReady("sub-1"); // idempotent
    expect(seen).toHaveLength(3);

    const ackHook = vi.fn();
    registerAcknowledgeHook(ackHook);
    acknowledgeReadiness({ submissionId: "sub-1", module: "schreiben", acknowledgedAt: 111 });
    expect(getReadiness()).toBeNull();
    expect(ackHook).toHaveBeenCalledWith({
      submissionId: "sub-1",
      module: "schreiben",
      acknowledgedAt: 111,
    });

    await flush();
    const db = await getLearnerDb();
    expect(await db.activeSubmission.toArray()).toHaveLength(0); // ack deleted the row
  });

  it("mismatched transitions are no-ops; failed carries a reason", () => {
    markSubmissionInFlight("sub-1", "sprechen");
    markCorrectionReady("other"); // different id — ignored
    expect(getReadiness()?.state).toBe("in-flight");
    markSubmissionFailed("sub-1", "reaper-timeout");
    expect(getReadiness()).toMatchObject({ state: "failed", failedReason: "reaper-timeout" });
    acknowledgeReadiness({ submissionId: "sub-1", module: "schreiben", acknowledgedAt: 1 }); // wrong module
    expect(getReadiness()).not.toBeNull();
  });

  it("guard blocks only while in-flight", () => {
    expect(isSubmissionAllowed()).toEqual({ allowed: true });
    markSubmissionInFlight("sub-1", "schreiben");
    expect(isSubmissionAllowed()).toEqual({ allowed: false, reason: "in-flight-exists" });
    markCorrectionReady("sub-1");
    expect(isSubmissionAllowed()).toEqual({ allowed: true });
  });

  it("persists the slot to activeSubmission keyed on user_id; skips when signed out", async () => {
    markSubmissionInFlight("sub-9", "sprechen");
    await flush();
    const db = await getLearnerDb();
    expect(await db.activeSubmission.get("u1")).toMatchObject({
      user_id: "u1",
      submission_id: "sub-9",
      module: "sprechen",
      state: "in-flight",
      slow: 0,
    });
    clearReadiness();
    await flush();
    expect(await db.activeSubmission.get("u1")).toBeUndefined();

    __setUserIdResolverForTest(() => null); // anonymous window
    markSubmissionInFlight("sub-10", "sprechen");
    await flush();
    expect(await db.activeSubmission.toArray()).toHaveLength(0);
    expect(getReadiness()?.submissionId).toBe("sub-10"); // in-memory still works
  });
});
