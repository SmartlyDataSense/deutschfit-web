import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `vi.hoisted` — TDZ rationale as in `learner-hoeren-audio-player.test.tsx`:
// `vi.mock` factories are hoisted above the rest of the module. `useAudioReplayMock`
// is a shared vi.fn whose behavior every describe block below configures
// explicitly in its own `beforeEach` (delegate-to-real for hook-level tests,
// static `mockReturnValue` for component-level tests) — never left to
// carry over from a previous block.
const hoisted = vi.hoisted(() => {
  const ref: { real: ((...args: unknown[]) => unknown) | null } = { real: null };
  const useAudioReplayMock = vi.fn((...args: unknown[]) => {
    if (!ref.real) throw new Error("useAudioReplayMock: real implementation not wired yet");
    return ref.real(...args);
  });
  return { ref, useAudioReplayMock };
});

vi.mock("@/learner/sprechen/hooks/useAudioReplay", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/sprechen/hooks/useAudioReplay")>();
  hoisted.ref.real = actual.useAudioReplay as unknown as (...args: unknown[]) => unknown;
  return {
    ...actual,
    useAudioReplay: (...args: unknown[]) => hoisted.useAudioReplayMock(...args),
  };
});

const { getSprechenAudioUrlMock } = vi.hoisted(() => ({ getSprechenAudioUrlMock: vi.fn() }));
vi.mock("@/learner/core/api/examApi", () => ({
  getSprechenAudioUrl: (...args: unknown[]) => getSprechenAudioUrlMock(...args),
}));

import { initLearnerI18n } from "@/learner/core/i18n";
import { AudioReplayButton } from "@/learner/sprechen/components/AudioReplayButton";
import { LocalAudioPlayer } from "@/learner/sprechen/components/LocalAudioPlayer";
import { createWebPlayer } from "@/learner/sprechen/audio/webPlayer";
import {
  INITIAL_AUDIO_REPLAY_SNAPSHOT,
  reduceAudioReplay,
  useAudioReplay,
  type AudioReplaySnapshot,
  type NativePlayer,
} from "@/learner/sprechen/hooks/useAudioReplay";
import { renderWithI18n } from "./helpers/renderWithI18n";

afterEach(() => {
  cleanup();
  hoisted.useAudioReplayMock.mockClear();
});

// ---------------------------------------------------------------------------
// (a) reducer — table-driven transitions, byte-comparable against mobile's
// `reduceAudioReplay`
// (deutschfit-mobile/src/features/sprechen/hooks/useAudioReplay.ts:188-231).
// ---------------------------------------------------------------------------
describe("reduceAudioReplay", () => {
  const idle = INITIAL_AUDIO_REPLAY_SNAPSHOT;
  const loading: AudioReplaySnapshot = {
    status: "loading",
    positionSec: 0,
    durationSec: 0,
    errorMessage: null,
  };
  const ready: AudioReplaySnapshot = {
    status: "ready",
    positionSec: 3,
    durationSec: 60,
    errorMessage: null,
  };
  const playing: AudioReplaySnapshot = {
    status: "playing",
    positionSec: 12,
    durationSec: 60,
    errorMessage: null,
  };
  const errored: AudioReplaySnapshot = {
    status: "error",
    positionSec: 0,
    durationSec: 0,
    errorMessage: "boom",
  };

  it("LOAD resets to a zeroed loading snapshot regardless of prior state", () => {
    expect(reduceAudioReplay(playing, { type: "LOAD" })).toEqual(loading);
    expect(reduceAudioReplay(errored, { type: "LOAD" })).toEqual(loading);
  });

  it("PLAY is a no-op from error", () => {
    expect(reduceAudioReplay(errored, { type: "PLAY" })).toBe(errored);
  });

  it("PLAY from ready moves to playing and clears a stale errorMessage", () => {
    const withStaleError = { ...ready, errorMessage: "stale" };
    expect(reduceAudioReplay(withStaleError, { type: "PLAY" })).toEqual({
      ...withStaleError,
      status: "playing",
      errorMessage: null,
    });
  });

  it("PAUSE only transitions out of playing", () => {
    expect(reduceAudioReplay(ready, { type: "PAUSE" })).toBe(ready);
    expect(reduceAudioReplay(loading, { type: "PAUSE" })).toBe(loading);
    expect(reduceAudioReplay(playing, { type: "PAUSE" })).toEqual({ ...playing, status: "paused" });
  });

  it("TICK is ignored in error and idle", () => {
    const tick = { type: "TICK" as const, positionSec: 5, durationSec: 60, isLoaded: true };
    expect(reduceAudioReplay(errored, tick)).toBe(errored);
    expect(reduceAudioReplay(idle, tick)).toBe(idle);
  });

  it("TICK promotes loading -> ready only once isLoaded is true", () => {
    const notYetLoaded = reduceAudioReplay(loading, {
      type: "TICK",
      positionSec: 1,
      durationSec: 60,
      isLoaded: false,
    });
    expect(notYetLoaded.status).toBe("loading");

    const loaded = reduceAudioReplay(loading, {
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

  it("TICK keeps the prior durationSec when the event reports 0", () => {
    const result = reduceAudioReplay(playing, {
      type: "TICK",
      positionSec: 20,
      durationSec: 0,
      isLoaded: true,
    });
    expect(result).toEqual({ ...playing, positionSec: 20, durationSec: 60 });
  });

  it("ENDED pins position to duration", () => {
    expect(reduceAudioReplay(playing, { type: "ENDED", durationSec: 60 })).toEqual({
      ...playing,
      status: "ended",
      positionSec: 60,
      durationSec: 60,
    });
  });

  it("ENDED falls back to the prior durationSec when the event reports 0", () => {
    expect(reduceAudioReplay(playing, { type: "ENDED", durationSec: 0 })).toEqual({
      ...playing,
      status: "ended",
      positionSec: 60,
      durationSec: 60,
    });
  });

  it("ERROR carries errorMessage from any state", () => {
    expect(reduceAudioReplay(playing, { type: "ERROR", message: "play_failed" })).toEqual({
      ...playing,
      status: "error",
      errorMessage: "play_failed",
    });
  });

  it("RESET returns the initial snapshot", () => {
    expect(reduceAudioReplay(playing, { type: "RESET" })).toBe(INITIAL_AUDIO_REPLAY_SNAPSHOT);
  });
});

// ---------------------------------------------------------------------------
// (b) hook — real `useAudioReplay` (delegated through the mock wrapper) +
// an injected fake `NativePlayer` factory. Fake timers drive the 250ms
// tick. No real jsdom media playback in this group.
// ---------------------------------------------------------------------------
type FakePollResult = ReturnType<NativePlayer["pollStatus"]>;

function makeFakeNativePlayer(
  overrides: {
    play?: NativePlayer["play"];
    pollStatus?: () => FakePollResult;
  } = {}
) {
  return {
    load: vi.fn(),
    play: vi.fn(overrides.play),
    pause: vi.fn(),
    pollStatus: vi.fn<() => FakePollResult>(overrides.pollStatus ?? (() => null)),
    release: vi.fn(),
  };
}

describe("useAudioReplay (hook)", () => {
  beforeEach(() => {
    hoisted.useAudioReplayMock.mockImplementation((...args: unknown[]) =>
      hoisted.ref.real!(...args)
    );
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("null factory -> error player_unavailable on load, never polls", () => {
    const { result } = renderHook(() => useAudioReplay(() => null));
    act(() => result.current.load("https://example.com/a.mp3"));
    expect(result.current.status).toBe("error");
    expect(result.current.errorMessage).toBe("player_unavailable");
  });

  it("load -> ready via TICK, play, 250ms tick updates the flattened snapshot fields", async () => {
    let poll: FakePollResult = null;
    const player = makeFakeNativePlayer({ pollStatus: vi.fn(() => poll) });
    const { result } = renderHook(() => useAudioReplay(() => player));

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
    const { result } = renderHook(() => useAudioReplay(() => player));

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

    const callsAtEnd = player.pollStatus.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(player.pollStatus.mock.calls.length).toBe(callsAtEnd);
  });

  it("play() returning a rejected promise -> play_failed (Web delta: async autoplay-policy rejection)", async () => {
    const player = makeFakeNativePlayer({
      play: vi.fn(() => Promise.reject(new Error("NotAllowedError"))),
    });
    const { result } = renderHook(() => useAudioReplay(() => player));
    act(() => result.current.load("u"));
    act(() => result.current.play());
    expect(result.current.status).toBe("playing");

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.status).toBe("error");
    expect(result.current.errorMessage).toBe("play_failed");
  });

  it("async play_failed stops the tick loop (no leaked polling past error)", async () => {
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
    const { result } = renderHook(() => useAudioReplay(() => player));
    act(() => result.current.load("u"));
    act(() => result.current.play());

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.status).toBe("error");

    const callsAtError = pollStatus.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(pollStatus.mock.calls.length).toBe(callsAtError);
  });

  it("sync-throwing play() -> play_failed too", () => {
    const player = makeFakeNativePlayer({
      play: vi.fn(() => {
        throw new Error("boom");
      }),
    });
    const { result } = renderHook(() => useAudioReplay(() => player));
    act(() => result.current.load("u"));
    act(() => result.current.play());
    expect(result.current.status).toBe("error");
    expect(result.current.errorMessage).toBe("play_failed");
  });

  it("unmount calls release() exactly once", () => {
    const player = makeFakeNativePlayer();
    const { unmount } = renderHook(() => useAudioReplay(() => player));
    unmount();
    expect(player.release).toHaveBeenCalledTimes(1);
  });

  it("reset() stops ticking, releases the native player, returns to the initial snapshot", async () => {
    const poll: FakePollResult = {
      positionSec: 5,
      durationSec: 60,
      playing: true,
      isLoaded: true,
      didJustFinish: false,
    };
    const player = makeFakeNativePlayer({ pollStatus: vi.fn(() => poll) });
    const { result } = renderHook(() => useAudioReplay(() => player));
    act(() => result.current.load("u"));
    act(() => result.current.reset());
    expect(player.release).toHaveBeenCalledTimes(1);
    expect(result.current).toMatchObject(INITIAL_AUDIO_REPLAY_SNAPSHOT);

    const callsAtReset = player.pollStatus.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(player.pollStatus.mock.calls.length).toBe(callsAtReset);
  });
});

// ---------------------------------------------------------------------------
// (c) createWebPlayer adapter — stubbed createElement returning a fake
// element object. jsdom's HTMLMediaElement methods are unimplemented; this
// never touches real playback.
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

describe("createWebPlayer (HTML5 adapter)", () => {
  it("pollStatus returns null before any load", () => {
    const fake = makeFakeAudioElement();
    const player = createWebPlayer(() => fake);
    expect(player.pollStatus()).toBeNull();
  });

  it("NaN duration/currentTime -> 0 in the poll", () => {
    const fake = makeFakeAudioElement();
    const player = createWebPlayer(() => fake);
    player.load("https://example.com/a.mp3");
    fake.currentTime = NaN;
    Object.defineProperty(fake, "duration", { value: NaN, configurable: true });
    expect(player.pollStatus()).toMatchObject({ positionSec: 0, durationSec: 0 });
  });

  it("ended event latches didJustFinish for exactly one poll", () => {
    const fake = makeFakeAudioElement();
    const player = createWebPlayer(() => fake);
    player.load("https://example.com/a.mp3");
    fake.__trigger("ended");
    expect(player.pollStatus()?.didJustFinish).toBe(true);
    expect(player.pollStatus()?.didJustFinish).toBe(false);
  });

  it("release() before any load does not throw and clears state", () => {
    const fake = makeFakeAudioElement();
    const player = createWebPlayer(() => fake);
    expect(() => player.release()).not.toThrow();
    expect(player.pollStatus()).toBeNull();
  });

  it("release() after a load pauses, detaches src via removeAttribute, and clears state", () => {
    const fake = makeFakeAudioElement();
    const player = createWebPlayer(() => fake);
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
    const player = createWebPlayer(() => fake);
    player.load("https://example.com/a.mp3");
    expect(() => player.release()).not.toThrow();
  });

  it("load sets preload=auto, assigns src, and calls el.load()", () => {
    const fake = makeFakeAudioElement();
    const player = createWebPlayer(() => fake);
    player.load("https://example.com/a.mp3");
    expect(fake.preload).toBe("auto");
    expect(fake.src).toBe("https://example.com/a.mp3");
    expect(fake.load).toHaveBeenCalledTimes(1);
  });

  it("never returns null itself — constructing touches no browser API (mirrors createWebRecorder)", () => {
    expect(createWebPlayer(() => makeFakeAudioElement())).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// (d) AudioReplayButton — component-level, `useAudioReplay` mocked to a
// static snapshot per test (fake `NativePlayer` never constructed).
// ---------------------------------------------------------------------------
const { loadMock, playMock, pauseMock, resetMock } = vi.hoisted(() => ({
  loadMock: vi.fn(),
  playMock: vi.fn(),
  pauseMock: vi.fn(),
  resetMock: vi.fn(),
}));

type MockSnapshot = AudioReplaySnapshot;

function snapshot(overrides: Partial<MockSnapshot> = {}) {
  return {
    status: "idle" as const,
    positionSec: 0,
    durationSec: 0,
    errorMessage: null,
    ...overrides,
    load: loadMock,
    play: playMock,
    pause: pauseMock,
    reset: resetMock,
  };
}

function tree(ui: ReactElement) {
  const i18n = initLearnerI18n("fr");
  return <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>;
}

describe("AudioReplayButton", () => {
  beforeEach(() => {
    loadMock.mockReset();
    playMock.mockReset();
    pauseMock.mockReset();
    resetMock.mockReset();
    getSprechenAudioUrlMock.mockReset();
    hoisted.useAudioReplayMock.mockReset();
    hoisted.useAudioReplayMock.mockReturnValue(snapshot());
  });

  it("first press fetches the signed URL exactly once and loads it", async () => {
    getSprechenAudioUrlMock.mockResolvedValue({
      url: "https://signed.example/a.webm",
      ttl_sec: 60,
    });
    renderWithI18n(<AudioReplayButton submissionId="sub-1" />);

    await act(async () => {
      fireEvent.click(screen.getByTestId("sprechen-feedback-audio-replay-button"));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getSprechenAudioUrlMock).toHaveBeenCalledTimes(1);
    expect(getSprechenAudioUrlMock).toHaveBeenCalledWith("sub-1");
    expect(loadMock).toHaveBeenCalledWith("https://signed.example/a.webm");
  });

  it("auto-plays once the mocked hook reports ready after the fetch", async () => {
    getSprechenAudioUrlMock.mockResolvedValue({
      url: "https://signed.example/a.webm",
      ttl_sec: 60,
    });
    const { rerender } = render(tree(<AudioReplayButton submissionId="sub-1" />));

    await act(async () => {
      fireEvent.click(screen.getByTestId("sprechen-feedback-audio-replay-button"));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(playMock).not.toHaveBeenCalled();

    // Simulate the hook's own state transition (loading -> ready) that a
    // real `useAudioReplay` would drive after `load()` resolves — the
    // component's `wantPlayRef` effect only re-runs on a `status` change.
    hoisted.useAudioReplayMock.mockReturnValue(snapshot({ status: "ready" }));
    rerender(tree(<AudioReplayButton submissionId="sub-1" />));

    expect(playMock).toHaveBeenCalledTimes(1);
  });

  it("renders 'Écouter mon enregistrement' when idle, 'Mettre en pause' + click->pause when playing", () => {
    renderWithI18n(<AudioReplayButton submissionId="sub-1" />);
    expect(screen.getByTestId("sprechen-feedback-audio-replay-button").textContent).toBe(
      "Écouter mon enregistrement"
    );
    cleanup();

    hoisted.useAudioReplayMock.mockReturnValue(
      snapshot({ status: "playing", positionSec: 3, durationSec: 20 })
    );
    renderWithI18n(<AudioReplayButton submissionId="sub-1" />);
    const button = screen.getByTestId("sprechen-feedback-audio-replay-button");
    expect(button.textContent).toBe("Mettre en pause");

    fireEvent.click(button);
    expect(pauseMock).toHaveBeenCalledTimes(1);
    expect(playMock).not.toHaveBeenCalled();
    expect(getSprechenAudioUrlMock).not.toHaveBeenCalled();
  });

  it("'Reprendre' when paused, click resumes via play() (no re-fetch)", () => {
    hoisted.useAudioReplayMock.mockReturnValue(
      snapshot({ status: "paused", positionSec: 3, durationSec: 20 })
    );
    renderWithI18n(<AudioReplayButton submissionId="sub-1" />);
    const button = screen.getByTestId("sprechen-feedback-audio-replay-button");
    expect(button.textContent).toBe("Reprendre");

    fireEvent.click(button);
    expect(playMock).toHaveBeenCalledTimes(1);
    expect(pauseMock).not.toHaveBeenCalled();
    expect(getSprechenAudioUrlMock).not.toHaveBeenCalled();
  });

  it("'Réécouter' when ended, clock shows the pinned position", () => {
    hoisted.useAudioReplayMock.mockReturnValue(
      snapshot({ status: "ended", positionSec: 20, durationSec: 20 })
    );
    renderWithI18n(<AudioReplayButton submissionId="sub-1" />);
    expect(screen.getByTestId("sprechen-feedback-audio-replay-button").textContent).toBe(
      "Réécouter"
    );
    expect(screen.getByTestId("sprechen-feedback-audio-replay-clock").textContent).toBe(
      "⏱ 0:20 / 0:20"
    );
  });

  it("renders the error caption on a signed-URL fetch failure", async () => {
    getSprechenAudioUrlMock.mockRejectedValue(new Error("audio_url_failed"));
    renderWithI18n(<AudioReplayButton submissionId="sub-1" />);

    await act(async () => {
      fireEvent.click(screen.getByTestId("sprechen-feedback-audio-replay-button"));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByTestId("sprechen-feedback-audio-replay-error").textContent).toBe(
      "Lecture indisponible. Réessaie."
    );
    expect(loadMock).not.toHaveBeenCalled();
  });

  it("disables the button and shows the unavailable caption on player_unavailable", () => {
    hoisted.useAudioReplayMock.mockReturnValue(
      snapshot({ status: "error", errorMessage: "player_unavailable" })
    );
    renderWithI18n(<AudioReplayButton submissionId="sub-1" />);

    const button = screen.getByTestId("sprechen-feedback-audio-replay-button");
    expect(button).toBeDisabled();
    expect(screen.getByTestId("sprechen-feedback-audio-replay-error").textContent).toBe(
      "La lecture audio n'est pas disponible dans cette version."
    );
  });
});

// ---------------------------------------------------------------------------
// (e) LocalAudioPlayer — component-level, `useAudioReplay` mocked.
// ---------------------------------------------------------------------------
describe("LocalAudioPlayer", () => {
  beforeEach(() => {
    loadMock.mockReset();
    playMock.mockReset();
    pauseMock.mockReset();
    resetMock.mockReset();
    hoisted.useAudioReplayMock.mockReset();
    hoisted.useAudioReplayMock.mockReturnValue(snapshot());
  });

  it("first press loads the passed local uri", () => {
    renderWithI18n(<LocalAudioPlayer uri="blob:local-recording" />);

    fireEvent.click(screen.getByTestId("sprechen-session-review-player-button"));

    expect(loadMock).toHaveBeenCalledWith("blob:local-recording");
    expect(getSprechenAudioUrlMock).not.toHaveBeenCalled();
  });

  it("shows the clock while playing, formatted M:SS / M:SS", () => {
    hoisted.useAudioReplayMock.mockReturnValue(
      snapshot({ status: "playing", positionSec: 12, durationSec: 40 })
    );
    renderWithI18n(<LocalAudioPlayer uri="blob:local-recording" />);

    expect(screen.getByTestId("sprechen-session-review-player-clock").textContent).toBe(
      "⏱ 0:12 / 0:40"
    );
    expect(screen.getByTestId("sprechen-session-review-player-button").textContent).toBe(
      "Mettre en pause"
    );
  });

  it("no clock and no error caption while idle", () => {
    renderWithI18n(<LocalAudioPlayer uri="blob:local-recording" />);

    expect(screen.queryByTestId("sprechen-session-review-player-clock")).not.toBeInTheDocument();
    expect(screen.queryByTestId("sprechen-session-review-player-error")).not.toBeInTheDocument();
  });

  it("renders the generic error caption on a non-player_unavailable error", () => {
    hoisted.useAudioReplayMock.mockReturnValue(
      snapshot({ status: "error", errorMessage: "load_failed" })
    );
    renderWithI18n(<LocalAudioPlayer uri="blob:local-recording" />);

    expect(screen.getByTestId("sprechen-session-review-player-error").textContent).toBe(
      "Lecture indisponible. Réessaie."
    );
    expect(screen.getByTestId("sprechen-session-review-player-button")).not.toBeDisabled();
  });

  it("custom testID prefixes every child testid", () => {
    renderWithI18n(<LocalAudioPlayer uri="blob:local-recording" testID="custom-player" />);
    expect(screen.getByTestId("custom-player")).toBeInTheDocument();
    expect(screen.getByTestId("custom-player-button")).toBeInTheDocument();
  });
});
