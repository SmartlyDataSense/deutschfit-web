/**
 * `createSprechenPoller` / `useSprechenSubmissionPolling` + `getMonologueTargetSec`
 * — S7 · Task 7.4.
 *
 * Port of `deutschfit-mobile/src/features/sprechen/hooks/useSprechenSubmissionPolling.ts`'s
 * test surface for the web transport (P2 — 5s/240s cadence, four terminal
 * statuses). Mocks only the facade's `getSprechenSubmission` (Constraint
 * 15 — this hook imports the wire fn from `@/learner/core/api/examApi`
 * only), keeping the rest of the facade real via `vi.mock`'s
 * `importOriginal` passthrough — same idiom as `learner-writing-polling.test.ts`.
 *
 * Fake timers throughout (`vi.useFakeTimers()`): the poller uses
 * `setTimeout` chaining (not `setInterval`), so each tick is scheduled
 * only after the previous one settles. `vi.advanceTimersByTimeAsync` is
 * required (not `advanceTimersByTime`) — it flushes the microtask queue
 * between timer callbacks so the chained `void tick()` promise actually
 * resolves before asserting on its effects.
 *
 * `getMonologueTargetSec` / `SHORT_RECORDING_RATIO` tests live in this
 * file too — the brief pins only two test files for the three Task 7.4
 * source modules, and the thresholds module is a small pure-function
 * sibling of the poller (both are P2-scope, both pure/timer-free).
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `vi.hoisted` — `vi.mock` factories are hoisted above the rest of the
// module, so the mock fn must be built via `vi.hoisted`, not a plain
// top-level `const` (same TDZ rationale as `learner-writing-polling.test.ts`).
const { getSprechenSubmissionMock } = vi.hoisted(() => ({
  getSprechenSubmissionMock: vi.fn(),
}));

// Partial mock: keep the real facade surface but stub the one fetcher this
// hook calls.
vi.mock("@/learner/core/api/examApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/core/api/examApi")>();
  return {
    ...actual,
    getSprechenSubmission: (...args: unknown[]) => getSprechenSubmissionMock(...args),
  };
});

import type { SprechenSubmission } from "@/learner/core/api/examApi";
import {
  createSprechenPoller,
  useSprechenSubmissionPolling,
  type SprechenPollingSnapshot,
} from "@/learner/sprechen/hooks/useSprechenSubmissionPolling";
import {
  getMonologueTargetSec,
  SHORT_RECORDING_RATIO,
} from "@/learner/sprechen/services/levelThresholds";

const INTERVAL_MS = 5_000;
const MAX_DURATION_MS = 240_000;

function sampleSubmission(overrides: Partial<SprechenSubmission> = {}): SprechenSubmission {
  return {
    id: "sub-1",
    user_id: "u1",
    exam_slug: "goethe-b1",
    teil: 1,
    status: "queued",
    audio_storage_path: "u1/sub-1.m4a",
    audio_duration_ms: 30_000,
    transcript_de: null,
    feedback_json: null,
    score: null,
    uploaded_at: "2026-08-08T00:00:00.000Z",
    graded_at: null,
    error_message: null,
    created_at: "2026-08-08T00:00:00.000Z",
    ...overrides,
  };
}

describe("createSprechenPoller", () => {
  beforeEach(() => {
    getSprechenSubmissionMock.mockReset();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("(a) graded on tick 2 stops the loop with the terminal snapshot", async () => {
    getSprechenSubmissionMock
      .mockResolvedValueOnce(sampleSubmission({ status: "queued" }))
      .mockResolvedValueOnce(sampleSubmission({ status: "graded" }));
    const onUpdate = vi.fn<(s: SprechenPollingSnapshot) => void>();
    const poller = createSprechenPoller("sub-1", onUpdate);

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(getSprechenSubmissionMock).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenLastCalledWith({
      status: "queued",
      data: sampleSubmission({ status: "queued" }),
      error: null,
    });

    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(getSprechenSubmissionMock).toHaveBeenCalledTimes(2);
    expect(onUpdate).toHaveBeenLastCalledWith({
      status: "graded",
      data: sampleSubmission({ status: "graded" }),
      error: null,
    });

    // Loop stopped — no further fetches after advancing time.
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 3);
    expect(getSprechenSubmissionMock).toHaveBeenCalledTimes(2);
  });

  it.each(["failed", "error", "rejected"] as const)(
    "(b) %s is a terminal status — stops the loop",
    async (status) => {
      getSprechenSubmissionMock.mockResolvedValue(sampleSubmission({ status }));
      const onUpdate = vi.fn<(s: SprechenPollingSnapshot) => void>();
      const poller = createSprechenPoller("sub-1", onUpdate);

      poller.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(onUpdate).toHaveBeenLastCalledWith({
        status,
        data: sampleSubmission({ status }),
        error: null,
      });

      await vi.advanceTimersByTimeAsync(INTERVAL_MS * 3);
      expect(getSprechenSubmissionMock).toHaveBeenCalledTimes(1);
    }
  );

  it("(c) a rejecting fetch on tick 1 emits {status: 'queued', error} and tick 2 still fires", async () => {
    getSprechenSubmissionMock
      .mockRejectedValueOnce(new Error("network_down"))
      .mockResolvedValueOnce(sampleSubmission({ status: "queued" }));
    const onUpdate = vi.fn<(s: SprechenPollingSnapshot) => void>();
    const poller = createSprechenPoller("sub-1", onUpdate);

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(onUpdate).toHaveBeenLastCalledWith({
      status: "queued",
      data: null,
      error: "network_down",
    });

    // The next tick still fires — the error path falls through to
    // `scheduleNext()` instead of tearing the loop down.
    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(getSprechenSubmissionMock).toHaveBeenCalledTimes(2);
    expect(onUpdate).toHaveBeenLastCalledWith({
      status: "queued",
      data: sampleSubmission({ status: "queued" }),
      error: null,
    });

    poller.stop();
  });

  it("a non-Error rejection falls back to the poll_failed message", async () => {
    getSprechenSubmissionMock.mockRejectedValueOnce("boom");
    const onUpdate = vi.fn<(s: SprechenPollingSnapshot) => void>();
    const poller = createSprechenPoller("sub-1", onUpdate);

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(onUpdate).toHaveBeenLastCalledWith({
      status: "queued",
      data: null,
      error: "poll_failed",
    });

    poller.stop();
  });

  it("(d) 240s budget exhausted emits 'timeout' once then stops", async () => {
    const inProgressRow = sampleSubmission({ status: "in_progress" });
    getSprechenSubmissionMock.mockResolvedValue(inProgressRow);
    const onUpdate = vi.fn<(s: SprechenPollingSnapshot) => void>();
    const poller = createSprechenPoller("sub-1", onUpdate);

    poller.start();
    // Drain every tick up to (but not past) the 240s budget.
    const ticks = MAX_DURATION_MS / INTERVAL_MS;
    for (let i = 0; i < ticks; i += 1) {
      await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    }

    expect(onUpdate).toHaveBeenLastCalledWith({
      status: "timeout",
      data: inProgressRow,
      error: null,
    });

    const callsAtTimeout = getSprechenSubmissionMock.mock.calls.length;
    const updatesAtTimeout = onUpdate.mock.calls.length;
    // "emitted once" — advancing further never re-emits or re-fetches.
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 3);
    expect(getSprechenSubmissionMock.mock.calls.length).toBe(callsAtTimeout);
    expect(onUpdate.mock.calls.length).toBe(updatesAtTimeout);
  });

  it("(e) stop() cancels cleanly — mid-flight resolution never emits", async () => {
    let resolveFetch: ((row: SprechenSubmission) => void) | undefined;
    getSprechenSubmissionMock.mockImplementationOnce(
      () =>
        new Promise<SprechenSubmission>((resolve) => {
          resolveFetch = resolve;
        })
    );
    const onUpdate = vi.fn<(s: SprechenPollingSnapshot) => void>();
    const poller = createSprechenPoller("sub-1", onUpdate);

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    poller.stop();
    resolveFetch?.(sampleSubmission({ status: "graded" }));
    await vi.advanceTimersByTimeAsync(0);

    expect(onUpdate).not.toHaveBeenCalled();

    // Also verify no further timer fires after `stop()`.
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 3);
    expect(getSprechenSubmissionMock).toHaveBeenCalledTimes(1);
  });
});

describe("useSprechenSubmissionPolling", () => {
  beforeEach(() => {
    getSprechenSubmissionMock.mockReset();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("id: null stays idle and never calls the API", async () => {
    const { result } = renderHook(() => useSprechenSubmissionPolling(null));
    expect(result.current).toEqual({ status: "idle", data: null, error: null });
    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(getSprechenSubmissionMock).not.toHaveBeenCalled();
  });

  it("polls on a real id and reaches graded", async () => {
    getSprechenSubmissionMock.mockResolvedValue(sampleSubmission({ status: "graded" }));
    const { result } = renderHook(() => useSprechenSubmissionPolling("sub-1"));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.status).toBe("graded");
    expect(getSprechenSubmissionMock).toHaveBeenCalledWith("sub-1");
  });

  it("unmount stops the poller — no further fetches after advancing time", async () => {
    getSprechenSubmissionMock.mockResolvedValue(sampleSubmission({ status: "queued" }));
    const { unmount } = renderHook(() => useSprechenSubmissionPolling("sub-1"));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const callsAtUnmount = getSprechenSubmissionMock.mock.calls.length;
    unmount();

    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 3);
    expect(getSprechenSubmissionMock.mock.calls.length).toBe(callsAtUnmount);
  });
});

describe("getMonologueTargetSec", () => {
  it("praesentation + B1 -> 180", () => {
    expect(getMonologueTargetSec("praesentation", "B1")).toBe(180);
  });

  it("vortrag + B2 -> 240", () => {
    expect(getMonologueTargetSec("vortrag", "B2")).toBe(240);
  });

  it("catch-all: any subgenre + B2 -> 240", () => {
    expect(getMonologueTargetSec("referat", "B2")).toBe(240);
  });

  it("catch-all: any subgenre + B1 -> 180", () => {
    expect(getMonologueTargetSec("bildbeschreibung", "B1")).toBe(180);
  });

  it("catch-all: anything else -> 180", () => {
    expect(getMonologueTargetSec(undefined, undefined)).toBe(180);
    expect(getMonologueTargetSec("erzaehlung", "C1")).toBe(180);
  });

  it("SHORT_RECORDING_RATIO is 0.5", () => {
    expect(SHORT_RECORDING_RATIO).toBe(0.5);
  });
});
