/**
 * `createSubmissionPoller` / `useSubmissionPolling` — S6 · Task 6.4.
 *
 * Port of `deutschfit-mobile/src/features/writing/hooks/useSubmissionPolling.ts`'s
 * test surface for the web transport. Mocks only the facade's
 * `getWritingSubmission` (Constraint 15 — this hook imports the wire fn
 * from `@/learner/core/api/examApi` only), keeping the rest of the facade
 * real via `vi.mock`'s `importOriginal` passthrough — same idiom as
 * `learner-hoeren-session-hook.test.ts`.
 *
 * Fake timers throughout (`vi.useFakeTimers()`): the poller uses
 * `setTimeout` chaining (not `setInterval`), so each tick is scheduled only
 * after the previous one settles. `vi.advanceTimersByTimeAsync` is required
 * (not `advanceTimersByTime`) — it flushes the microtask queue between
 * timer callbacks so the chained `void tick()` promise actually resolves
 * before asserting on its effects.
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `vi.hoisted` — `vi.mock` factories are hoisted above the rest of the
// module, so the mock fn must be built via `vi.hoisted`, not a plain
// top-level `const` (same TDZ rationale as `learner-writing-api.test.ts`).
const { getWritingSubmissionMock } = vi.hoisted(() => ({
  getWritingSubmissionMock: vi.fn(),
}));

// Partial mock: keep the real facade surface but stub the one fetcher this
// hook calls (same pattern as `learner-hoeren-session-hook.test.ts`).
vi.mock("@/learner/core/api/examApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/core/api/examApi")>();
  return {
    ...actual,
    getWritingSubmission: (...args: unknown[]) => getWritingSubmissionMock(...args),
  };
});

import type { WritingSubmission } from "@/learner/core/api/examApi";
import {
  createSubmissionPoller,
  useSubmissionPolling,
  type PollingSnapshot,
} from "@/learner/schreiben/hooks/useSubmissionPolling";

const INTERVAL_MS = 2_000;
const MAX_DURATION_MS = 240_000;

function sampleSubmission(overrides: Partial<WritingSubmission> = {}): WritingSubmission {
  return {
    id: "sub-1",
    user_id: "u1",
    prompt_id: "p1",
    body_de: "Text",
    word_count: 40,
    status: "pending",
    score_inhalt: null,
    score_wortschatz_gram: null,
    score_kommunikation: null,
    feedback_json: null,
    grader_version: null,
    model_name: null,
    graded_at: null,
    error_message: null,
    created_at: "2026-08-08T00:00:00.000Z",
    ...overrides,
  };
}

describe("createSubmissionPoller", () => {
  beforeEach(() => {
    getWritingSubmissionMock.mockReset();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("pending row ticks again at the 2s cadence", async () => {
    getWritingSubmissionMock.mockResolvedValue(sampleSubmission({ status: "pending" }));
    const onUpdate = vi.fn<(s: PollingSnapshot) => void>();
    const poller = createSubmissionPoller("sub-1", onUpdate);

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(getWritingSubmissionMock).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenLastCalledWith({
      status: "pending",
      data: sampleSubmission({ status: "pending" }),
      error: null,
    });

    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(getWritingSubmissionMock).toHaveBeenCalledTimes(2);

    poller.stop();
  });

  it("graded row stops the loop — no further fetches after advancing time", async () => {
    getWritingSubmissionMock.mockResolvedValue(sampleSubmission({ status: "graded" }));
    const onUpdate = vi.fn<(s: PollingSnapshot) => void>();
    const poller = createSubmissionPoller("sub-1", onUpdate);

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(getWritingSubmissionMock).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenLastCalledWith({
      status: "graded",
      data: sampleSubmission({ status: "graded" }),
      error: null,
    });

    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 3);
    expect(getWritingSubmissionMock).toHaveBeenCalledTimes(1);
  });

  it("failed row stops the loop", async () => {
    getWritingSubmissionMock.mockResolvedValue(sampleSubmission({ status: "failed" }));
    const onUpdate = vi.fn<(s: PollingSnapshot) => void>();
    const poller = createSubmissionPoller("sub-1", onUpdate);

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(onUpdate).toHaveBeenLastCalledWith({
      status: "failed",
      data: sampleSubmission({ status: "failed" }),
      error: null,
    });

    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 3);
    expect(getWritingSubmissionMock).toHaveBeenCalledTimes(1);
  });

  it("a rejected fetch emits {status: lastStatus ?? pending, error} and the next tick still fires", async () => {
    getWritingSubmissionMock
      .mockRejectedValueOnce(new Error("network_down"))
      .mockResolvedValueOnce(sampleSubmission({ status: "pending" }));
    const onUpdate = vi.fn<(s: PollingSnapshot) => void>();
    const poller = createSubmissionPoller("sub-1", onUpdate);

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(onUpdate).toHaveBeenLastCalledWith({
      status: "pending",
      data: null,
      error: "network_down",
    });

    // The next tick still fires — proves the error path falls through to
    // `scheduleNext()` instead of tearing the loop down.
    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(getWritingSubmissionMock).toHaveBeenCalledTimes(2);
    expect(onUpdate).toHaveBeenLastCalledWith({
      status: "pending",
      data: sampleSubmission({ status: "pending" }),
      error: null,
    });

    poller.stop();
  });

  it("a non-Error rejection falls back to the poll_failed message", async () => {
    getWritingSubmissionMock.mockRejectedValueOnce("boom");
    const onUpdate = vi.fn<(s: PollingSnapshot) => void>();
    const poller = createSubmissionPoller("sub-1", onUpdate);

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(onUpdate).toHaveBeenLastCalledWith({
      status: "pending",
      data: null,
      error: "poll_failed",
    });

    poller.stop();
  });

  it("240s budget exhausted emits {status: timeout, data: lastData} then stops", async () => {
    const gradingRow = sampleSubmission({ status: "grading" });
    getWritingSubmissionMock.mockResolvedValue(gradingRow);
    const onUpdate = vi.fn<(s: PollingSnapshot) => void>();
    const poller = createSubmissionPoller("sub-1", onUpdate);

    poller.start();
    // Drain every tick up to (but not past) the 240s budget.
    const ticks = MAX_DURATION_MS / INTERVAL_MS;
    for (let i = 0; i < ticks; i += 1) {
      await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    }

    expect(onUpdate).toHaveBeenLastCalledWith({
      status: "timeout",
      data: gradingRow,
      error: null,
    });

    const callsAtTimeout = getWritingSubmissionMock.mock.calls.length;
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 3);
    expect(getWritingSubmissionMock.mock.calls.length).toBe(callsAtTimeout);
  });

  it("stop() mid-flight suppresses late emissions", async () => {
    let resolveFetch: ((row: WritingSubmission) => void) | undefined;
    getWritingSubmissionMock.mockImplementationOnce(
      () =>
        new Promise<WritingSubmission>((resolve) => {
          resolveFetch = resolve;
        })
    );
    const onUpdate = vi.fn<(s: PollingSnapshot) => void>();
    const poller = createSubmissionPoller("sub-1", onUpdate);

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    poller.stop();
    resolveFetch?.(sampleSubmission({ status: "graded" }));
    await vi.advanceTimersByTimeAsync(0);

    expect(onUpdate).not.toHaveBeenCalled();
  });
});

describe("useSubmissionPolling", () => {
  beforeEach(() => {
    getWritingSubmissionMock.mockReset();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("id: null stays idle and never calls the API", async () => {
    const { result } = renderHook(() => useSubmissionPolling(null));
    expect(result.current).toEqual({ status: "idle", data: null, error: null });
    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(getWritingSubmissionMock).not.toHaveBeenCalled();
  });

  it("polls on a real id and reaches graded", async () => {
    getWritingSubmissionMock.mockResolvedValue(sampleSubmission({ status: "graded" }));
    const { result } = renderHook(() => useSubmissionPolling("sub-1"));

    // `waitFor` polls on a real `setInterval`, which never fires while fake
    // timers are active — flush the microtask queue directly instead
    // (same fake-timer/act interplay as `learner-hoeren-audio.test.ts`).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.status).toBe("graded");
    expect(getWritingSubmissionMock).toHaveBeenCalledWith("sub-1");
  });

  it("unmount stops the poller — no further fetches after advancing time", async () => {
    getWritingSubmissionMock.mockResolvedValue(sampleSubmission({ status: "pending" }));
    const { unmount } = renderHook(() => useSubmissionPolling("sub-1"));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const callsAtUnmount = getWritingSubmissionMock.mock.calls.length;
    unmount();

    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 3);
    expect(getWritingSubmissionMock.mock.calls.length).toBe(callsAtUnmount);
  });
});
