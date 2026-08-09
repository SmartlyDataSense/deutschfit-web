import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createWebMicCheck,
  INITIAL_MIC_CHECK_SNAPSHOT,
  MIC_CHECK_DURATION_MS,
  reduceMicCheck,
  useMicCheck,
  type MicCheckSnapshot,
  type NativeMicCheck,
} from "@/learner/sprechen/hooks/useMicCheck";
import {
  __resetMicCheckFlagStoreForTests,
  bootstrapMicCheckFlag,
  markMicCheckPassedFlag,
  readMicCheckPassed,
  resetMicCheckFlag,
  useMicCheckFlag,
} from "@/learner/sprechen/hooks/useMicCheckFlag";
import { LEARNER_MIC_CHECK_PASSED_KEY } from "@/learner/core/storage/flags";

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// (a) reducer — table-driven transitions, byte-comparable against mobile's
// `reduceMicCheck` (deutschfit-mobile/src/features/sprechen/hooks/useMicCheck.ts:67-89).
// ---------------------------------------------------------------------------
describe("reduceMicCheck", () => {
  const idle = INITIAL_MIC_CHECK_SNAPSHOT;
  const requesting: MicCheckSnapshot = { status: "requesting", errorMessage: null, uri: null };
  const recording: MicCheckSnapshot = { status: "recording", errorMessage: null, uri: null };
  const recorded: MicCheckSnapshot = { status: "recorded", errorMessage: null, uri: "blob:x" };
  const playing: MicCheckSnapshot = { status: "playing", errorMessage: null, uri: "blob:x" };
  const errored: MicCheckSnapshot = { status: "error", errorMessage: "record_failed", uri: null };

  it("REQUEST -> requesting, clears a stale errorMessage", () => {
    expect(
      reduceMicCheck({ ...idle, errorMessage: "permission_denied" }, { type: "REQUEST" })
    ).toEqual({
      ...idle,
      status: "requesting",
      errorMessage: null,
    });
  });

  it("RECORDING_STARTED -> recording, clears errorMessage", () => {
    expect(reduceMicCheck(requesting, { type: "RECORDING_STARTED" })).toEqual({
      ...requesting,
      status: "recording",
      errorMessage: null,
    });
  });

  it("RECORDING_STOPPED -> recorded, carries the uri", () => {
    expect(reduceMicCheck(recording, { type: "RECORDING_STOPPED", uri: "blob:x" })).toEqual({
      ...recording,
      status: "recorded",
      uri: "blob:x",
    });
  });

  it("PLAYBACK_STARTED -> playing", () => {
    expect(reduceMicCheck(recorded, { type: "PLAYBACK_STARTED" })).toEqual({
      ...recorded,
      status: "playing",
    });
  });

  it("PLAYBACK_FINISHED -> done", () => {
    expect(reduceMicCheck(playing, { type: "PLAYBACK_FINISHED" })).toEqual({
      ...playing,
      status: "done",
    });
  });

  it("ERROR carries errorMessage from any state", () => {
    expect(reduceMicCheck(playing, { type: "ERROR", message: "playback_failed" })).toEqual({
      ...playing,
      status: "error",
      errorMessage: "playback_failed",
    });
  });

  it("RESET returns the initial snapshot", () => {
    expect(reduceMicCheck(errored, { type: "RESET" })).toBe(INITIAL_MIC_CHECK_SNAPSHOT);
  });
});

// ---------------------------------------------------------------------------
// (b) hook — scripted fake `NativeMicCheck`, fake timers for the 5s
// auto-stop. No real jsdom media APIs anywhere in this group.
// ---------------------------------------------------------------------------
function makeFakeNativeMicCheck(overrides: Partial<NativeMicCheck> = {}): NativeMicCheck {
  return {
    requestPermissions: vi.fn(async () => ({ granted: true })),
    startRecording: vi.fn(async () => {}),
    stopRecording: vi.fn(async () => ({ uri: "blob:fake-mic-check-uri" })),
    playUri: vi.fn(async () => {}),
    release: vi.fn(),
    ...overrides,
  };
}

describe("useMicCheck", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("full happy path: requesting -> recording -> recorded -> playing -> done, onPassed fires exactly once", async () => {
    const onPassed = vi.fn();
    const native = makeFakeNativeMicCheck();
    const { result } = renderHook(() => useMicCheck({ nativeFactory: () => native, onPassed }));

    expect(result.current.status).toBe("idle");

    await act(async () => {
      const started = result.current.start();
      await vi.advanceTimersByTimeAsync(MIC_CHECK_DURATION_MS);
      await started;
    });

    expect(native.requestPermissions).toHaveBeenCalledTimes(1);
    expect(native.startRecording).toHaveBeenCalledTimes(1);
    expect(native.stopRecording).toHaveBeenCalledTimes(1);
    expect(native.playUri).toHaveBeenCalledWith("blob:fake-mic-check-uri");
    expect(result.current.status).toBe("done");
    expect(result.current.uri).toBe("blob:fake-mic-check-uri");
    expect(onPassed).toHaveBeenCalledTimes(1);
  });

  it("permission denial lands permission_denied, never starts recording, never calls onPassed", async () => {
    const onPassed = vi.fn();
    const native = makeFakeNativeMicCheck({
      requestPermissions: vi.fn(async () => ({ granted: false })),
    });
    const { result } = renderHook(() => useMicCheck({ nativeFactory: () => native, onPassed }));

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.status).toBe("error");
    expect(result.current.errorMessage).toBe("permission_denied");
    expect(native.startRecording).not.toHaveBeenCalled();
    expect(onPassed).not.toHaveBeenCalled();
  });

  it("requestPermissions() throwing also lands permission_denied", async () => {
    const native = makeFakeNativeMicCheck({
      requestPermissions: vi.fn(async () => {
        throw new Error("NotAllowedError");
      }),
    });
    const { result } = renderHook(() => useMicCheck({ nativeFactory: () => native }));

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.errorMessage).toBe("permission_denied");
  });

  it("playUri rejection lands playback_failed, onPassed never called", async () => {
    const onPassed = vi.fn();
    const native = makeFakeNativeMicCheck({
      playUri: vi.fn(async () => {
        throw new Error("NotAllowedError");
      }),
    });
    const { result } = renderHook(() => useMicCheck({ nativeFactory: () => native, onPassed }));

    await act(async () => {
      const started = result.current.start();
      await vi.advanceTimersByTimeAsync(MIC_CHECK_DURATION_MS);
      await started;
    });

    expect(result.current.status).toBe("error");
    expect(result.current.errorMessage).toBe("playback_failed");
    expect(onPassed).not.toHaveBeenCalled();
  });

  it("the 5s auto-stop uses the setTimeout duration — stopRecording is not called before durationMs elapses", async () => {
    const native = makeFakeNativeMicCheck();
    const { result } = renderHook(() => useMicCheck({ nativeFactory: () => native }));

    await act(async () => {
      void result.current.start();
      await vi.advanceTimersByTimeAsync(MIC_CHECK_DURATION_MS - 1);
    });
    expect(native.stopRecording).not.toHaveBeenCalled();
    expect(result.current.status).toBe("recording");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(native.stopRecording).toHaveBeenCalledTimes(1);
  });

  it("respects a custom durationMs override", async () => {
    const native = makeFakeNativeMicCheck();
    const { result } = renderHook(() =>
      useMicCheck({ nativeFactory: () => native, durationMs: 1000 })
    );

    await act(async () => {
      const started = result.current.start();
      await vi.advanceTimersByTimeAsync(1000);
      await started;
    });
    expect(native.stopRecording).toHaveBeenCalledTimes(1);
  });

  it("startRecording() throwing exactly recorder_unavailable preserves that message (DECISION, 7.2 review) — not the generic record_failed", async () => {
    const native = makeFakeNativeMicCheck({
      startRecording: vi.fn(async () => {
        throw new Error("recorder_unavailable");
      }),
    });
    const { result } = renderHook(() => useMicCheck({ nativeFactory: () => native }));

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.status).toBe("error");
    expect(result.current.errorMessage).toBe("recorder_unavailable");
  });

  it("startRecording() throwing any other error lands the generic record_failed", async () => {
    const native = makeFakeNativeMicCheck({
      startRecording: vi.fn(async () => {
        throw new Error("device_busy");
      }),
    });
    const { result } = renderHook(() => useMicCheck({ nativeFactory: () => native }));

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.errorMessage).toBe("record_failed");
  });

  it("stopRecording() rejecting also lands record_failed", async () => {
    const native = makeFakeNativeMicCheck({
      stopRecording: vi.fn(async () => {
        throw new Error("stop_boom");
      }),
    });
    const { result } = renderHook(() => useMicCheck({ nativeFactory: () => native }));

    await act(async () => {
      const started = result.current.start();
      await vi.advanceTimersByTimeAsync(MIC_CHECK_DURATION_MS);
      await started;
    });
    expect(result.current.errorMessage).toBe("record_failed");
  });

  it("null nativeFactory -> recorder_unavailable immediately, no native calls at all", async () => {
    const { result } = renderHook(() => useMicCheck({ nativeFactory: () => null }));

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.status).toBe("error");
    expect(result.current.errorMessage).toBe("recorder_unavailable");
  });

  it("reset() releases the native module and returns to the initial snapshot", () => {
    const native = makeFakeNativeMicCheck();
    const { result } = renderHook(() => useMicCheck({ nativeFactory: () => native }));

    act(() => result.current.reset());

    expect(native.release).toHaveBeenCalledTimes(1);
    expect(result.current).toMatchObject(INITIAL_MIC_CHECK_SNAPSHOT);
  });

  it("unmount calls release() exactly once", () => {
    const native = makeFakeNativeMicCheck();
    const { unmount } = renderHook(() => useMicCheck({ nativeFactory: () => native }));

    unmount();

    expect(native.release).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// (c) createWebMicCheck's `playUri` — the only genuinely new browser-facing
// logic in this file (permission/record wiring delegates straight to
// `createWebRecorder`, already fully covered by
// `learner-sprechen-web-recorder.test.ts`). Exercised with a fake
// `HTMLAudioElement` so it never touches real jsdom media playback or the
// recorder's MediaRecorder/getUserMedia surface.
// ---------------------------------------------------------------------------
type FakeAudioElement = HTMLAudioElement & { __trigger: (type: string) => void };

function makeFakeAudioElement(
  playImpl: () => Promise<void> = () => Promise.resolve()
): FakeAudioElement {
  const listeners = new Map<string, Set<() => void>>();
  const el = {
    src: "",
    play: vi.fn(playImpl),
    pause: vi.fn(),
    removeAttribute: vi.fn(),
    addEventListener: (type: string, cb: () => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(cb);
    },
    removeEventListener: (type: string, cb: () => void) => {
      listeners.get(type)?.delete(cb);
    },
  } as unknown as FakeAudioElement;
  el.__trigger = (type: string) => {
    listeners.get(type)?.forEach((cb) => cb());
  };
  return el;
}

describe("createWebMicCheck — playUri", () => {
  it("resolves when the 'ended' event fires", async () => {
    const fake = makeFakeAudioElement();
    const native = createWebMicCheck(() => fake);

    const p = native.playUri("blob:x");
    fake.__trigger("ended");
    await expect(p).resolves.toBeUndefined();
    expect(fake.src).toBe("blob:x");
    expect(fake.play).toHaveBeenCalledTimes(1);
  });

  it("rejects when play() rejects", async () => {
    const fake = makeFakeAudioElement(() => Promise.reject(new Error("NotAllowedError")));
    const native = createWebMicCheck(() => fake);

    await expect(native.playUri("blob:x")).rejects.toThrow("NotAllowedError");
  });

  it("release() before any playUri call does not throw", () => {
    const native = createWebMicCheck(() => makeFakeAudioElement());
    expect(() => native.release()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// (d) useMicCheckFlag — key round-trip through the shared localStorage
// flags helper (P5). Testing caveat: jsdom's `window.localStorage` is
// unreliable under this repo's vitest setup (per `flags.ts`'s own doc
// comment) — install a minimal in-memory `Storage` mock, same idiom as
// `learner-db.test.ts`.
// ---------------------------------------------------------------------------
function installLocalStorageMock(): void {
  let store = new Map<string, string>();
  const mock: Storage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store = new Map();
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(window, "localStorage", {
    value: mock,
    configurable: true,
    writable: true,
  });
}

describe("useMicCheckFlag", () => {
  beforeEach(() => {
    installLocalStorageMock();
    __resetMicCheckFlagStoreForTests();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it("markPassed persists under the exact mobile key literal", async () => {
    expect(readMicCheckPassed()).toBe(false);

    await markMicCheckPassedFlag();

    expect(window.localStorage.getItem(LEARNER_MIC_CHECK_PASSED_KEY)).toBe("true");
    expect(readMicCheckPassed()).toBe(true);
  });

  it("resetMicCheckFlag clears a previously-set flag", async () => {
    await markMicCheckPassedFlag();
    expect(readMicCheckPassed()).toBe(true);

    await resetMicCheckFlag();

    expect(readMicCheckPassed()).toBe(false);
    expect(window.localStorage.getItem(LEARNER_MIC_CHECK_PASSED_KEY)).toBeNull();
  });

  it("the store starts unhydrated; hydrate() reads a previously-set flag back", async () => {
    window.localStorage.setItem(LEARNER_MIC_CHECK_PASSED_KEY, "true");

    const { result } = renderHook(() => useMicCheckFlag());
    expect(result.current.hydrated).toBe(false);
    expect(result.current.passed).toBe(false);

    await act(async () => {
      await bootstrapMicCheckFlag();
    });

    expect(result.current.hydrated).toBe(true);
    expect(result.current.passed).toBe(true);
  });

  it("markPassed() through the hook flips passed to true and persists", async () => {
    const { result } = renderHook(() => useMicCheckFlag());

    await act(async () => {
      await result.current.markPassed();
    });

    expect(result.current.passed).toBe(true);
    expect(window.localStorage.getItem(LEARNER_MIC_CHECK_PASSED_KEY)).toBe("true");
  });

  it("reset() through the hook flips passed to false and clears storage", async () => {
    const { result } = renderHook(() => useMicCheckFlag());
    await act(async () => {
      await result.current.markPassed();
    });
    expect(result.current.passed).toBe(true);

    await act(async () => {
      await result.current.reset();
    });

    expect(result.current.passed).toBe(false);
    expect(window.localStorage.getItem(LEARNER_MIC_CHECK_PASSED_KEY)).toBeNull();
  });
});
