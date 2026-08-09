import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/learner/core/auth/useLearnerSession", () => {
  let userId: string | null = "u1";
  return {
    useLearnerSession: { getState: () => ({ session: userId ? { user: { id: userId } } : null }) },
    __setUser: (id: string | null) => {
      userId = id;
    },
  };
});
const trackEvent = vi.fn();
vi.mock("@/learner/core/analytics/posthog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/core/analytics/posthog")>();
  return { ...actual, trackEvent: (...a: unknown[]) => trackEvent(...a) };
});

import { __resetLearnerDbForTests, getLearnerDb } from "@/learner/core/db";
import {
  __resetReadinessForTest,
  __setUserIdResolverForTest,
  getReadiness,
  subscribeReadiness,
} from "@/learner/core/readiness";
import type { ReadinessSignal } from "@/learner/core/readiness";
import {
  __resetHydrateForTest,
  __setFetchUnacknowledgedForTest,
  hydrateOnBoot,
  hydrateOnForeground,
} from "@/learner/core/readiness/hydrate";

const emptyServer = { sprechen: [], writing: [] };

describe("readiness hydration (boot + foreground)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    __resetReadinessForTest();
    __resetHydrateForTest();
    __resetLearnerDbForTests();
    __setUserIdResolverForTest(() => "u1");
  });

  it("replays the local Dexie row on boot when the server has nothing new", async () => {
    const db = await getLearnerDb();
    await db.activeSubmission.put({
      user_id: "u1",
      submission_id: "sub-1",
      module: "schreiben",
      state: "in-flight",
      slow: 0,
      failed_reason: null,
      started_at: 123,
      acknowledged_at: null,
    });
    __setFetchUnacknowledgedForTest(async () => emptyServer);
    await hydrateOnBoot();
    expect(getReadiness()).toMatchObject({ submissionId: "sub-1", state: "in-flight", startedAt: 123 });
  });

  it("server graded + local in-flight → flips to ready (server wins the terminal)", async () => {
    const db = await getLearnerDb();
    await db.activeSubmission.put({
      user_id: "u1",
      submission_id: "sub-1",
      module: "sprechen",
      state: "in-flight",
      slow: 0,
      failed_reason: null,
      started_at: 1,
      acknowledged_at: null,
    });
    __setFetchUnacknowledgedForTest(async () => ({
      sprechen: [{ id: "sub-1", status: "graded", created_at: "2026-08-09T00:00:00Z", graded_at: "2026-08-09T00:01:00Z" }],
      writing: [],
    }));
    await hydrateOnBoot();
    expect(getReadiness()).toMatchObject({ submissionId: "sub-1", state: "ready" });
  });

  it("server-only rows seed the slot; newest created_at wins; graded seeds in-flight then ready", async () => {
    __setFetchUnacknowledgedForTest(async () => ({
      sprechen: [{ id: "old", status: "pending", created_at: "2026-08-01T00:00:00Z", graded_at: null }],
      writing: [{ id: "new", status: "graded", created_at: "2026-08-09T00:00:00Z", graded_at: null }],
    }));
    await hydrateOnBoot();
    expect(getReadiness()).toMatchObject({ submissionId: "new", module: "schreiben", state: "ready" });
  });

  it("server failure installs local (if any) + tracks hydrate_failed; signed-out is a no-op", async () => {
    __setFetchUnacknowledgedForTest(async () => {
      throw new Error("net");
    });
    await hydrateOnBoot();
    expect(trackEvent).toHaveBeenCalledWith("hydrate_failed", { phase: "boot", reason: "server_fetch" });
    expect(getReadiness()).toBeNull();

    __setUserIdResolverForTest(() => null);
    const { __setUser } = (await import("@/learner/core/auth/useLearnerSession")) as unknown as {
      __setUser: (id: string | null) => void;
    };
    __setUser(null);
    trackEvent.mockClear();
    await hydrateOnBoot();
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("foreground replay is throttled to one run per 30s window", async () => {
    const fetcher = vi.fn(async () => emptyServer);
    __setFetchUnacknowledgedForTest(fetcher);
    await hydrateOnForeground();
    await hydrateOnForeground();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  // Regression — final whole-branch review (2026-08-08): a subscriber
  // registered before `hydrateOnBoot()` (the polling adapter, the
  // StatusStrip hook — `LearnerProviders` installs `installPollingAdapter()`
  // synchronously and only then kicks off `hydrateOnBoot()` without
  // awaiting it) used to see nothing when boot restored a local
  // in-flight row: the local-restore path called `__hydrateForBoot`,
  // which by design never notifies. On web there's no push channel to
  // compensate (unlike mobile), so the poller never started and the
  // strip stayed blind for the rest of the session across a reload.
  it("notifies a subscriber registered before hydrateOnBoot when a local in-flight row is restored (server still pending)", async () => {
    const db = await getLearnerDb();
    await db.activeSubmission.put({
      user_id: "u1",
      submission_id: "sub-restore-pending",
      module: "sprechen",
      state: "in-flight",
      slow: 0,
      failed_reason: null,
      started_at: 456,
      acknowledged_at: null,
    });
    __setFetchUnacknowledgedForTest(async () => ({
      sprechen: [
        {
          id: "sub-restore-pending",
          status: "pending",
          created_at: "2026-08-09T00:00:00Z",
          graded_at: null,
        },
      ],
      writing: [],
    }));

    const received: Array<ReadinessSignal | null> = [];
    const unsubscribe = subscribeReadiness((signal) => received.push(signal));

    await hydrateOnBoot();
    unsubscribe();

    expect(received.length).toBeGreaterThan(0);
    expect(received[received.length - 1]).toMatchObject({
      submissionId: "sub-restore-pending",
      state: "in-flight",
    });
  });

  // Same defect, `failed` sub-case: hydrate itself never translates a
  // server `failed` status for an already-local-in-flight row — the
  // poll worker is what lands `markSubmissionFailed`, with a precise
  // reason, once it's running. So the bar here is the same as the
  // `pending` case: the restored in-flight signal must reach a
  // subscriber that mounted before `hydrateOnBoot()` (standing in for
  // `installPollingAdapter`'s `subscribeReadiness(sync)`), because
  // that's the only thing that lets a poller start at all. Without it
  // the slot is pinned `in-flight` forever and
  // `isSubmissionAllowed()` blocks every future submit with no visible
  // cue.
  it("notifies a subscriber registered before hydrateOnBoot even when the server already flipped to failed (poller — not hydrate — lands the failure)", async () => {
    const db = await getLearnerDb();
    await db.activeSubmission.put({
      user_id: "u1",
      submission_id: "sub-restore-failed",
      module: "schreiben",
      state: "in-flight",
      slow: 0,
      failed_reason: null,
      started_at: 789,
      acknowledged_at: null,
    });
    __setFetchUnacknowledgedForTest(async () => ({
      sprechen: [],
      writing: [
        {
          id: "sub-restore-failed",
          status: "failed",
          created_at: "2026-08-09T00:00:00Z",
          graded_at: null,
        },
      ],
    }));

    const received: Array<ReadinessSignal | null> = [];
    const unsubscribe = subscribeReadiness((signal) => received.push(signal));

    await hydrateOnBoot();
    unsubscribe();

    expect(received.length).toBeGreaterThan(0);
    expect(received[received.length - 1]).toMatchObject({
      submissionId: "sub-restore-failed",
      state: "in-flight",
    });
  });
});
