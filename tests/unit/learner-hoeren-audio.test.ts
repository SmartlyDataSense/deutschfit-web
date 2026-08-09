import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHtmlAudioPlayer, type HoerenNativePlayer } from "@/learner/core/audio/hoerenPlayer";
import {
  INITIAL_HOEREN_AUDIO_SNAPSHOT,
  reduceHoerenAudio,
  useHoerenAudio,
  type HoerenAudioSnapshot,
} from "@/learner/hoeren/hooks/useHoerenAudio";

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// (a) reducer — table-driven transitions ported from mobile's verified
// reduceHoerenAudio (useHoerenAudio.ts:175-226).
// ---------------------------------------------------------------------------
describe("reduceHoerenAudio", () => {
  const idle = INITIAL_HOEREN_AUDIO_SNAPSHOT;
  const loading: HoerenAudioSnapshot = {
    status: "loading",
    positionSec: 0,
    durationSec: 0,
    errorMessage: null,
  };
  const ready: HoerenAudioSnapshot = {
    status: "ready",
    positionSec: 3,
    durationSec: 60,
    errorMessage: null,
  };
  const playing: HoerenAudioSnapshot = {
    status: "playing",
    positionSec: 12,
    durationSec: 60,
    errorMessage: null,
  };
  const errored: HoerenAudioSnapshot = {
    status: "error",
    positionSec: 0,
    durationSec: 0,
    errorMessage: "boom",
  };

  it("LOAD resets to a zeroed loading snapshot regardless of prior state", () => {
    expect(reduceHoerenAudio(playing, { type: "LOAD" })).toEqual(loading);
    expect(reduceHoerenAudio(errored, { type: "LOAD" })).toEqual(loading);
  });

  it("PLAY is a no-op from error", () => {
    expect(reduceHoerenAudio(errored, { type: "PLAY" })).toBe(errored);
  });

  it("PLAY from ready moves to playing and clears a stale errorMessage", () => {
    const withStaleError = { ...ready, errorMessage: "stale" };
    expect(reduceHoerenAudio(withStaleError, { type: "PLAY" })).toEqual({
      ...withStaleError,
      status: "playing",
      errorMessage: null,
    });
  });

  it("PAUSE only transitions out of playing", () => {
    expect(reduceHoerenAudio(ready, { type: "PAUSE" })).toBe(ready);
    expect(reduceHoerenAudio(loading, { type: "PAUSE" })).toBe(loading);
    expect(reduceHoerenAudio(playing, { type: "PAUSE" })).toEqual({ ...playing, status: "paused" });
  });

  it("REPLAY moves to playing at positionSec 0, no-op from error", () => {
    expect(reduceHoerenAudio(playing, { type: "REPLAY" })).toEqual({
      ...playing,
      status: "playing",
      positionSec: 0,
      errorMessage: null,
    });
    expect(reduceHoerenAudio(errored, { type: "REPLAY" })).toBe(errored);
  });

  it("TICK is ignored in error and idle", () => {
    const tick = { type: "TICK" as const, positionSec: 5, durationSec: 60, isLoaded: true };
    expect(reduceHoerenAudio(errored, tick)).toBe(errored);
    expect(reduceHoerenAudio(idle, tick)).toBe(idle);
  });

  it("TICK promotes loading -> ready only once isLoaded is true", () => {
    const notYetLoaded = reduceHoerenAudio(loading, {
      type: "TICK",
      positionSec: 1,
      durationSec: 60,
      isLoaded: false,
    });
    expect(notYetLoaded.status).toBe("loading");

    const loaded = reduceHoerenAudio(loading, {
      type: "TICK",
      positionSec: 1,
      durationSec: 60,
      isLoaded: true,
    });
    expect(loaded).toEqual({
      status: "ready",
      positionSec: 1,
      durationSec: 60,
      errorMessage: null,
    });
  });

  it("TICK keeps the prior durationSec when the event reports 0 (event.durationSec || state.durationSec)", () => {
    const result = reduceHoerenAudio(playing, {
      type: "TICK",
      positionSec: 20,
      durationSec: 0,
      isLoaded: true,
    });
    expect(result).toEqual({ ...playing, positionSec: 20, durationSec: 60 });
  });

  it("ENDED pins position to duration", () => {
    expect(reduceHoerenAudio(playing, { type: "ENDED", durationSec: 60 })).toEqual({
      ...playing,
      status: "ended",
      positionSec: 60,
      durationSec: 60,
    });
  });

  it("ENDED falls back to the prior durationSec when the event reports 0", () => {
    expect(reduceHoerenAudio(playing, { type: "ENDED", durationSec: 0 })).toEqual({
      ...playing,
      status: "ended",
      positionSec: 60,
      durationSec: 60,
    });
  });

  it("ERROR carries errorMessage from any state", () => {
    expect(reduceHoerenAudio(playing, { type: "ERROR", message: "play_failed" })).toEqual({
      ...playing,
      status: "error",
      errorMessage: "play_failed",
    });
  });

  it("RESET returns the initial snapshot", () => {
    expect(reduceHoerenAudio(playing, { type: "RESET" })).toBe(INITIAL_HOEREN_AUDIO_SNAPSHOT);
  });
});

// ---------------------------------------------------------------------------
// (b) hook — vi.useFakeTimers() + an injected fake factory (scripted
// pollStatus returns). No real jsdom media playback anywhere in this group.
// ---------------------------------------------------------------------------
type FakePollResult = ReturnType<HoerenNativePlayer["pollStatus"]>;

function makeFakeNativePlayer(
  overrides: {
    play?: HoerenNativePlayer["play"];
    pollStatus?: () => FakePollResult;
  } = {}
) {
  return {
    load: vi.fn(),
    play: vi.fn(overrides.play),
    pause: vi.fn(),
    seekTo: vi.fn(),
    pollStatus: vi.fn<() => FakePollResult>(overrides.pollStatus ?? (() => null)),
    release: vi.fn(),
  };
}

describe("useHoerenAudio", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("null factory -> error player_unavailable on load, never polls", () => {
    const { result } = renderHook(() => useHoerenAudio(() => null));
    act(() => result.current.load("https://example.com/a.mp3"));
    expect(result.current.status).toBe("error");
    expect(result.current.errorMessage).toBe("player_unavailable");
  });

  it("load -> ready via TICK, play, 250ms tick updates the flattened snapshot fields", async () => {
    let poll: FakePollResult = null;
    const player = makeFakeNativePlayer({ pollStatus: vi.fn(() => poll) });
    const { result } = renderHook(() => useHoerenAudio(() => player));

    poll = {
      positionSec: 0,
      durationSec: 60,
      playing: false,
      isLoaded: true,
      didJustFinish: false,
    };
    act(() => result.current.load("https://example.com/a.mp3"));
    expect(player.load).toHaveBeenCalledWith("https://example.com/a.mp3");
    expect(result.current.status).toBe("loading");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(result.current.status).toBe("ready");
    expect(result.current.durationSec).toBe(60);

    act(() => result.current.play());
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("playing");

    poll = {
      positionSec: 12.5,
      durationSec: 60,
      playing: true,
      isLoaded: true,
      didJustFinish: false,
    };
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(result.current.positionSec).toBe(12.5);
    expect(result.current.durationSec).toBe(60);
    expect(result.current.status).toBe("playing");
  });

  it("didJustFinish poll flips status to ended and stops ticking", async () => {
    let poll: FakePollResult = {
      positionSec: 0,
      durationSec: 30,
      playing: false,
      isLoaded: true,
      didJustFinish: false,
    };
    const player = makeFakeNativePlayer({ pollStatus: vi.fn(() => poll) });
    const { result } = renderHook(() => useHoerenAudio(() => player));

    act(() => result.current.load("u"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    act(() => result.current.play());

    poll = {
      positionSec: 30,
      durationSec: 30,
      playing: false,
      isLoaded: true,
      didJustFinish: true,
    };
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(result.current.status).toBe("ended");
    expect(result.current.positionSec).toBe(30);

    const callsAtEnd = player.pollStatus.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(player.pollStatus.mock.calls.length).toBe(callsAtEnd); // tick stopped
  });

  it("P1b: play() returning a rejected promise -> errorMessage play_failed (fails on a blind port)", async () => {
    const player = makeFakeNativePlayer({
      play: vi.fn(() => Promise.reject(new Error("NotAllowedError"))),
    });
    const { result } = renderHook(() => useHoerenAudio(() => player));
    act(() => result.current.load("u"));
    act(() => result.current.play());
    // Sync path is optimistic — mobile's sync try/catch cannot see this yet.
    expect(result.current.status).toBe("playing");

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.status).toBe("error");
    expect(result.current.errorMessage).toBe("play_failed");
  });

  it("P1b regression: async play_failed stops the tick loop (no leaked polling past error)", async () => {
    const pollStatus = vi.fn<() => FakePollResult>(() => ({
      positionSec: 1,
      durationSec: 60,
      playing: true,
      isLoaded: true,
      didJustFinish: false,
    }));
    const player = makeFakeNativePlayer({
      play: vi.fn(() => Promise.reject(new Error("NotAllowedError"))),
      pollStatus,
    });
    const { result } = renderHook(() => useHoerenAudio(() => player));
    act(() => result.current.load("u"));
    act(() => result.current.play());

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.status).toBe("error");
    expect(result.current.errorMessage).toBe("play_failed");

    const callsAtError = pollStatus.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    // The tick loop must be stopped once the async rejection lands —
    // otherwise pollStatus() keeps firing past the error state, and a
    // later didJustFinish:true poll could silently flip error -> ended.
    expect(pollStatus.mock.calls.length).toBe(callsAtError);
    expect(result.current.status).toBe("error");
  });

  it("sync-throwing play() -> play_failed too", () => {
    const player = makeFakeNativePlayer({
      play: vi.fn(() => {
        throw new Error("boom");
      }),
    });
    const { result } = renderHook(() => useHoerenAudio(() => player));
    act(() => result.current.load("u"));
    act(() => result.current.play());
    expect(result.current.status).toBe("error");
    expect(result.current.errorMessage).toBe("play_failed");
  });

  it("replay(): rejected promise also -> play_failed, and stops the tick loop too", async () => {
    const pollStatus = vi.fn<() => FakePollResult>(() => ({
      positionSec: 1,
      durationSec: 60,
      playing: true,
      isLoaded: true,
      didJustFinish: false,
    }));
    const player = makeFakeNativePlayer({
      play: vi.fn(() => Promise.reject(new Error("NotAllowedError"))),
      pollStatus,
    });
    const { result } = renderHook(() => useHoerenAudio(() => player));
    act(() => result.current.load("u"));
    act(() => result.current.replay());
    expect(player.seekTo).toHaveBeenCalledWith(0);
    expect(result.current.status).toBe("playing");

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.status).toBe("error");
    expect(result.current.errorMessage).toBe("play_failed");

    const callsAtError = pollStatus.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(pollStatus.mock.calls.length).toBe(callsAtError); // tick stopped
  });

  it("unmount calls release() exactly once", () => {
    const player = makeFakeNativePlayer();
    const { unmount } = renderHook(() => useHoerenAudio(() => player));
    unmount();
    expect(player.release).toHaveBeenCalledTimes(1);
  });

  it("reset() stops ticking, releases the native player, and returns to the initial snapshot", async () => {
    const poll: FakePollResult = {
      positionSec: 5,
      durationSec: 60,
      playing: true,
      isLoaded: true,
      didJustFinish: false,
    };
    const player = makeFakeNativePlayer({ pollStatus: vi.fn(() => poll) });
    const { result } = renderHook(() => useHoerenAudio(() => player));
    act(() => result.current.load("u"));
    act(() => result.current.reset());
    expect(player.release).toHaveBeenCalledTimes(1);
    expect(result.current).toMatchObject(INITIAL_HOEREN_AUDIO_SNAPSHOT);

    const callsAtReset = player.pollStatus.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(player.pollStatus.mock.calls.length).toBe(callsAtReset); // tick stopped
  });
});

// ---------------------------------------------------------------------------
// (c) adapter — stubbed createElement returning a fake element object.
// jsdom's HTMLMediaElement methods are unimplemented; this never touches
// real playback.
// ---------------------------------------------------------------------------
type FakeAudioElement = HTMLAudioElement & { __trigger: (type: string) => void };

function makeFakeAudioElement(): FakeAudioElement {
  const listeners = new Map<string, Set<() => void>>();
  const el = {
    preload: "",
    src: "",
    currentTime: 0,
    duration: NaN,
    paused: true,
    ended: false,
    readyState: 0,
    play: vi.fn(() => Promise.resolve()),
    pause: vi.fn(),
    load: vi.fn(),
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

describe("createHtmlAudioPlayer (HTML5 adapter)", () => {
  it("pollStatus returns null before any load", () => {
    const fake = makeFakeAudioElement();
    const player = createHtmlAudioPlayer(() => fake)!;
    expect(player.pollStatus()).toBeNull();
  });

  it("NaN duration/currentTime -> 0 in the poll", () => {
    const fake = makeFakeAudioElement();
    const player = createHtmlAudioPlayer(() => fake)!;
    player.load("https://example.com/a.mp3");
    fake.currentTime = NaN;
    Object.defineProperty(fake, "duration", { value: NaN, configurable: true });
    const status = player.pollStatus();
    expect(status).toMatchObject({ positionSec: 0, durationSec: 0 });
  });

  it("ended event latches didJustFinish for exactly one poll", () => {
    const fake = makeFakeAudioElement();
    const player = createHtmlAudioPlayer(() => fake)!;
    player.load("https://example.com/a.mp3");
    fake.__trigger("ended");
    expect(player.pollStatus()?.didJustFinish).toBe(true);
    expect(player.pollStatus()?.didJustFinish).toBe(false);
  });

  it("release() before any load does not throw and clears state", () => {
    const fake = makeFakeAudioElement();
    const player = createHtmlAudioPlayer(() => fake)!;
    expect(() => player.release()).not.toThrow();
    expect(player.pollStatus()).toBeNull();
  });

  it("release() after a load pauses, detaches src via removeAttribute (not src=''), and clears state", () => {
    const fake = makeFakeAudioElement();
    const player = createHtmlAudioPlayer(() => fake)!;
    player.load("https://example.com/a.mp3");
    player.release();
    expect(fake.pause).toHaveBeenCalledTimes(1);
    expect(fake.removeAttribute).toHaveBeenCalledWith("src");
    expect(player.pollStatus()).toBeNull();
  });

  it("release() never throws even if the underlying element's pause() throws (jsdom)", () => {
    const fake = makeFakeAudioElement();
    fake.pause = vi.fn(() => {
      throw new Error("jsdom: HTMLMediaElement.prototype.pause not implemented");
    }) as unknown as typeof fake.pause;
    const player = createHtmlAudioPlayer(() => fake)!;
    player.load("https://example.com/a.mp3");
    expect(() => player.release()).not.toThrow();
    expect(player.pollStatus()).toBeNull();
  });

  it("seekTo clamps to >= 0", () => {
    const fake = makeFakeAudioElement();
    const player = createHtmlAudioPlayer(() => fake)!;
    player.load("https://example.com/a.mp3");
    player.seekTo(-5);
    expect(fake.currentTime).toBe(0);
  });

  it("load sets preload=auto, assigns src, and calls el.load()", () => {
    const fake = makeFakeAudioElement();
    const player = createHtmlAudioPlayer(() => fake)!;
    player.load("https://example.com/a.mp3");
    expect(fake.preload).toBe("auto");
    expect(fake.src).toBe("https://example.com/a.mp3");
    expect(fake.load).toHaveBeenCalledTimes(1);
  });

  it("returns null when window.Audio is unavailable (SSR guard)", () => {
    const original = window.Audio;
    // @ts-expect-error test-only deletion to simulate an environment without Audio
    delete window.Audio;
    expect(createHtmlAudioPlayer(() => makeFakeAudioElement())).toBeNull();
    window.Audio = original;
  });
});
