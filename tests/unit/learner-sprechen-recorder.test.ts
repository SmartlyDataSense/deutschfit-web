import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// F1/F2 guard: `useRecorder`'s unmount cleanup calls the REAL
// `releaseRecording` from `webRecorder.ts` (not a test seam) — mock just
// that export (passthrough for everything else, including the untouched
// module-level registry the mocked fn doesn't share) so tests can assert
// it was invoked without wiring a full fake registry.
const { releaseRecordingMock } = vi.hoisted(() => ({ releaseRecordingMock: vi.fn() }));

vi.mock("@/learner/sprechen/audio/webRecorder", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/sprechen/audio/webRecorder")>();
  return { ...actual, releaseRecording: releaseRecordingMock };
});

import {
  appendLevel,
  INITIAL_RECORDER_SNAPSHOT,
  LEVELS_WINDOW,
  normalizeMetering,
  reduceRecorder,
  useRecorder,
  type NativeRecorder,
  type RecorderSnapshot,
} from "@/learner/sprechen/hooks/useRecorder";

afterEach(() => {
  cleanup();
  releaseRecordingMock.mockReset();
});

// ---------------------------------------------------------------------------
// (a) normalizeMetering — mobile-verbatim −60dBFS floor -> 0..1 linear map.
// ---------------------------------------------------------------------------
describe("normalizeMetering", () => {
  it("−60 dB floors to 0", () => {
    expect(normalizeMetering(-60)).toBe(0);
  });
  it("below the floor also clamps to 0", () => {
    expect(normalizeMetering(-90)).toBe(0);
  });
  it("−30 dB maps to the midpoint 0.5", () => {
    expect(normalizeMetering(-30)).toBe(0.5);
  });
  it("0 dB maps to 1", () => {
    expect(normalizeMetering(0)).toBe(1);
  });
  it("above 0 dB clamps to 1", () => {
    expect(normalizeMetering(5)).toBe(1);
  });
  it("non-finite values (NaN/Infinity) -> 0", () => {
    expect(normalizeMetering(NaN)).toBe(0);
    expect(normalizeMetering(Infinity)).toBe(0);
    expect(normalizeMetering(-Infinity)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// (b) appendLevel — 45-sample sliding window (LEVELS_WINDOW).
// ---------------------------------------------------------------------------
describe("appendLevel", () => {
  it("grows the window until it reaches LEVELS_WINDOW", () => {
    let levels: readonly number[] = [];
    for (let i = 0; i < 10; i++) {
      levels = appendLevel(levels, 0.5);
    }
    expect(levels).toHaveLength(10);
  });

  it("slides once the window is full, dropping the oldest sample", () => {
    let levels: readonly number[] = [];
    for (let i = 0; i < LEVELS_WINDOW; i++) {
      levels = appendLevel(levels, i / LEVELS_WINDOW);
    }
    expect(levels).toHaveLength(LEVELS_WINDOW);
    const next = appendLevel(levels, 0.99);
    expect(next).toHaveLength(LEVELS_WINDOW);
    // oldest sample (index 0, value 0) dropped; newest pushed to the end.
    expect(next[0]).toBe(levels[1]);
    expect(next[next.length - 1]).toBe(0.99);
  });

  it("clamps out-of-range values to [0, 1]", () => {
    const levels = appendLevel([], -0.4);
    expect(levels[0]).toBe(0);
    const levels2 = appendLevel([], 1.4);
    expect(levels2[0]).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// (c) reduceRecorder — table-driven transitions ported from mobile's
// verified reduceRecorder (hooks/useRecorder.ts:220-270).
// ---------------------------------------------------------------------------
describe("reduceRecorder", () => {
  const idle = INITIAL_RECORDER_SNAPSHOT;
  const requesting: RecorderSnapshot = { ...idle, status: "requesting" };
  const recording: RecorderSnapshot = {
    status: "recording",
    permission: "granted",
    durationMs: 4200,
    uri: null,
    errorMessage: null,
    levels: [0.1, 0.2, 0.3],
  };
  const stopped: RecorderSnapshot = {
    status: "stopped",
    permission: "granted",
    durationMs: 5000,
    uri: "blob:fake-1",
    errorMessage: null,
    levels: [0.1, 0.2, 0.3],
  };
  const errored: RecorderSnapshot = {
    ...idle,
    status: "error",
    errorMessage: "boom",
  };

  it("REQUEST_PERMISSION moves to requesting and clears a stale errorMessage", () => {
    expect(reduceRecorder(errored, { type: "REQUEST_PERMISSION" })).toEqual({
      ...errored,
      status: "requesting",
      errorMessage: null,
    });
  });

  it("PERMISSION_RESULT granted -> idle/granted, clears errorMessage", () => {
    expect(reduceRecorder(requesting, { type: "PERMISSION_RESULT", granted: true })).toEqual({
      ...requesting,
      status: "idle",
      permission: "granted",
      errorMessage: null,
    });
  });

  it("PERMISSION_RESULT denied -> error/denied with permission_denied message", () => {
    expect(reduceRecorder(requesting, { type: "PERMISSION_RESULT", granted: false })).toEqual({
      ...requesting,
      status: "error",
      permission: "denied",
      errorMessage: "permission_denied",
    });
  });

  it("START resets duration/uri/levels/error and moves to recording", () => {
    expect(reduceRecorder(stopped, { type: "START" })).toEqual({
      ...stopped,
      status: "recording",
      durationMs: 0,
      uri: null,
      errorMessage: null,
      levels: [],
    });
  });

  it("TICK is a no-op outside recording", () => {
    const tick = { type: "TICK" as const, durationMs: 999, level: 0.5 };
    expect(reduceRecorder(idle, tick)).toBe(idle);
    expect(reduceRecorder(stopped, tick)).toBe(stopped);
    expect(reduceRecorder(errored, tick)).toBe(errored);
  });

  it("TICK with a level appends to the sliding window and updates durationMs", () => {
    const result = reduceRecorder(recording, { type: "TICK", durationMs: 4300, level: 0.4 });
    expect(result.durationMs).toBe(4300);
    expect(result.levels).toEqual([0.1, 0.2, 0.3, 0.4]);
  });

  it("TICK with a null level keeps the levels window unchanged", () => {
    const result = reduceRecorder(recording, { type: "TICK", durationMs: 4300, level: null });
    expect(result.durationMs).toBe(4300);
    expect(result.levels).toBe(recording.levels);
  });

  it("STOP_SUCCESS moves to stopped, carries uri/durationMs, clears errorMessage", () => {
    expect(
      reduceRecorder(recording, { type: "STOP_SUCCESS", uri: "blob:fake-2", durationMs: 6100 })
    ).toEqual({
      ...recording,
      status: "stopped",
      durationMs: 6100,
      uri: "blob:fake-2",
      errorMessage: null,
    });
  });

  it("ERROR carries errorMessage from any state", () => {
    expect(reduceRecorder(recording, { type: "ERROR", message: "start_failed" })).toEqual({
      ...recording,
      status: "error",
      errorMessage: "start_failed",
    });
  });

  it("RESET returns the initial snapshot", () => {
    expect(reduceRecorder(recording, { type: "RESET" })).toBe(INITIAL_RECORDER_SNAPSHOT);
  });
});

// ---------------------------------------------------------------------------
// (d) useRecorder — vi.useFakeTimers() + a scripted fake NativeRecorder.
// No real browser/jsdom media APIs touched in this group; the adapter has
// its own suite in learner-sprechen-web-recorder.test.ts.
// ---------------------------------------------------------------------------
type FakePollResult = ReturnType<NativeRecorder["pollStatus"]>;

function makeFakeNativeRecorder(
  overrides: {
    requestPermissions?: NativeRecorder["requestPermissions"];
    startRecording?: NativeRecorder["startRecording"];
    stopRecording?: NativeRecorder["stopRecording"];
    pollStatus?: () => FakePollResult;
  } = {}
): NativeRecorder {
  return {
    requestPermissions: vi.fn(overrides.requestPermissions ?? (async () => ({ granted: true }))),
    startRecording: vi.fn(overrides.startRecording ?? (async () => {})),
    stopRecording:
      overrides.stopRecording ?? vi.fn(async () => ({ uri: "blob:fake", durationMs: 1000 })),
    pollStatus: vi.fn<() => FakePollResult>(overrides.pollStatus ?? (() => null)),
  };
}

describe("useRecorder", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("null factory -> error recorder_unavailable on start, never polls", async () => {
    const { result } = renderHook(() => useRecorder(() => null));
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.status).toBe("error");
    expect(result.current.errorMessage).toBe("recorder_unavailable");
  });

  it("null factory -> error recorder_unavailable on requestPermission", async () => {
    const { result } = renderHook(() => useRecorder(() => null));
    await act(async () => {
      await result.current.requestPermission();
    });
    expect(result.current.status).toBe("error");
    expect(result.current.errorMessage).toBe("recorder_unavailable");
  });

  it("requestPermission granted -> idle/granted", async () => {
    const native = makeFakeNativeRecorder({ requestPermissions: async () => ({ granted: true }) });
    const { result } = renderHook(() => useRecorder(() => native));
    await act(async () => {
      await result.current.requestPermission();
    });
    expect(result.current.status).toBe("idle");
    expect(result.current.permission).toBe("granted");
  });

  it("permission-denied path lands permission_denied", async () => {
    const native = makeFakeNativeRecorder({ requestPermissions: async () => ({ granted: false }) });
    const { result } = renderHook(() => useRecorder(() => native));
    await act(async () => {
      await result.current.requestPermission();
    });
    expect(result.current.status).toBe("error");
    expect(result.current.permission).toBe("denied");
    expect(result.current.errorMessage).toBe("permission_denied");
  });

  it("requestPermissions throwing -> permission_request_failed", async () => {
    const native = makeFakeNativeRecorder({
      requestPermissions: async () => {
        throw new Error("boom");
      },
    });
    const { result } = renderHook(() => useRecorder(() => native));
    await act(async () => {
      await result.current.requestPermission();
    });
    expect(result.current.status).toBe("error");
    expect(result.current.errorMessage).toBe("permission_request_failed");
  });

  it("start() failing -> start_failed and stops ticking", async () => {
    const native = makeFakeNativeRecorder({
      startRecording: async () => {
        throw new Error("nope");
      },
    });
    const { result } = renderHook(() => useRecorder(() => native));
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.status).toBe("error");
    expect(result.current.errorMessage).toBe("start_failed");
  });

  it("start -> tick pushes levels via the 100ms poll", async () => {
    let poll: FakePollResult = { durationMs: 0, metering: null };
    const native = makeFakeNativeRecorder({ pollStatus: () => poll });
    const { result } = renderHook(() => useRecorder(() => native));

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.status).toBe("recording");

    poll = { durationMs: 100, metering: -30 };
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(result.current.durationMs).toBe(100);
    expect(result.current.levels).toEqual([0.5]);

    poll = { durationMs: 200, metering: -60 };
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(result.current.durationMs).toBe(200);
    expect(result.current.levels).toEqual([0.5, 0]);
  });

  it("a null pollStatus() result is skipped (no TICK dispatched)", async () => {
    const poll: FakePollResult = null;
    const native = makeFakeNativeRecorder({ pollStatus: () => poll });
    const { result } = renderHook(() => useRecorder(() => native));
    await act(async () => {
      await result.current.start();
    });
    const durationBefore = result.current.durationMs;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(result.current.durationMs).toBe(durationBefore);
    expect(result.current.levels).toEqual([]);
  });

  it("F-028: stop() resolves the returned {uri, durationMs} directly — a same-tick snapshot read would be stale", async () => {
    const native = makeFakeNativeRecorder({
      stopRecording: vi.fn(async () => ({ uri: "blob:fresh", durationMs: 4321 })),
    });
    const { result } = renderHook(() => useRecorder(() => native));
    await act(async () => {
      await result.current.start();
    });

    // Before stop() resolves, the snapshot's uri is still null — a closure
    // that captured `result.current.uri` here (the same-tick read F-028
    // warns against) would see the stale pre-stop value, never "blob:fresh".
    expect(result.current.uri).toBeNull();

    let returned: { uri: string; durationMs: number } | undefined;
    await act(async () => {
      returned = await result.current.stop();
    });

    // The return value is authoritative and available immediately on
    // resolution — this is what callers must use.
    expect(returned).toEqual({ uri: "blob:fresh", durationMs: 4321 });
    // React state has caught up by the time `act` flushes, but production
    // code must never depend on that ordering — only on the return value.
    expect(result.current.uri).toBe("blob:fresh");
    expect(result.current.status).toBe("stopped");
  });

  it("stop() stops the tick loop", async () => {
    const pollStatus = vi.fn<() => FakePollResult>(() => ({ durationMs: 500, metering: -10 }));
    const native = makeFakeNativeRecorder({ pollStatus });
    const { result } = renderHook(() => useRecorder(() => native));
    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await result.current.stop();
    });
    const callsAtStop = pollStatus.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(pollStatus.mock.calls.length).toBe(callsAtStop);
  });

  it("stop() with no native -> resolves {uri:'', durationMs:0} and dispatches recorder_unavailable", async () => {
    const { result } = renderHook(() => useRecorder(() => null));
    let returned: { uri: string; durationMs: number } | undefined;
    await act(async () => {
      returned = await result.current.stop();
    });
    expect(returned).toEqual({ uri: "", durationMs: 0 });
    expect(result.current.status).toBe("error");
    expect(result.current.errorMessage).toBe("recorder_unavailable");
  });

  it("stop() failing -> stop_failed, resolves {uri:'', durationMs:0}", async () => {
    const native = makeFakeNativeRecorder({
      stopRecording: vi.fn(async () => {
        throw new Error("boom");
      }),
    });
    const { result } = renderHook(() => useRecorder(() => native));
    await act(async () => {
      await result.current.start();
    });
    let returned: { uri: string; durationMs: number } | undefined;
    await act(async () => {
      returned = await result.current.stop();
    });
    expect(returned).toEqual({ uri: "", durationMs: 0 });
    expect(result.current.status).toBe("error");
    expect(result.current.errorMessage).toBe("stop_failed");
  });

  it("reset() stops ticking and returns to the initial snapshot", async () => {
    const pollStatus = vi.fn<() => FakePollResult>(() => ({ durationMs: 200, metering: -20 }));
    const native = makeFakeNativeRecorder({ pollStatus });
    const { result } = renderHook(() => useRecorder(() => native));
    await act(async () => {
      await result.current.start();
    });
    act(() => {
      result.current.reset();
    });
    expect(result.current).toMatchObject(INITIAL_RECORDER_SNAPSHOT);

    const callsAtReset = pollStatus.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(pollStatus.mock.calls.length).toBe(callsAtReset);
  });

  it("unmount stops the tick loop (no leaked interval)", async () => {
    const pollStatus = vi.fn<() => FakePollResult>(() => ({ durationMs: 200, metering: -20 }));
    const native = makeFakeNativeRecorder({ pollStatus });
    const { result, unmount } = renderHook(() => useRecorder(() => native));
    await act(async () => {
      await result.current.start();
    });
    const callsAtUnmount = pollStatus.mock.calls.length;
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(pollStatus.mock.calls.length).toBe(callsAtUnmount);
  });

  // -------------------------------------------------------------------------
  // F1 — unmount mid-recording must stop the native recorder (mic
  // stream/MediaRecorder/AudioContext) and release its blob, not just stop
  // the tick loop. Removing the cleanup's `stateRef.current.status ===
  // "recording"` branch in useRecorder.ts makes both tests below fail.
  // -------------------------------------------------------------------------
  it("F1: unmount while recording stops the native recorder and releases its blob", async () => {
    const stopRecording = vi.fn(async () => ({ uri: "blob:live-recording", durationMs: 3_000 }));
    const native = makeFakeNativeRecorder({ stopRecording });
    const { result, unmount } = renderHook(() => useRecorder(() => native));

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.status).toBe("recording");

    unmount();
    // `native.stopRecording()` resolves asynchronously (it's a Promise even
    // in this fake) — flush the microtask queue the cleanup's `.then()`
    // chain runs on.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(stopRecording).toHaveBeenCalledTimes(1);
    expect(releaseRecordingMock).toHaveBeenCalledWith("blob:live-recording");
  });

  it("F1: a normal unmount AFTER stop() already resolved does not call native.stopRecording() again (status is no longer 'recording')", async () => {
    const stopRecording = vi.fn(async () => ({ uri: "blob:already-stopped", durationMs: 1_000 }));
    const native = makeFakeNativeRecorder({ stopRecording });
    const { result, unmount } = renderHook(() => useRecorder(() => native));

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await result.current.stop();
    });
    stopRecording.mockClear();
    releaseRecordingMock.mockClear();

    unmount();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(stopRecording).not.toHaveBeenCalled();
    expect(releaseRecordingMock).not.toHaveBeenCalled();
  });
});
