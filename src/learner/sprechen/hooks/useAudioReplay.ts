/**
 * Audio replay hook for the Sprechen review + feedback screens (web).
 *
 * Verbatim port of deutschfit-mobile's `useAudioReplay` reducer + hook
 * (`deutschfit-mobile/src/features/sprechen/hooks/useAudioReplay.ts:174-357`)
 * — same statuses (idle/loading/ready/playing/paused/ended/error), same
 * 250ms poll cadence, same injectable-factory lifecycle, same error
 * strings (`player_unavailable`/`load_failed`/`play_failed`). The native
 * module surface (`NativePlayer`) moves to
 * `@/learner/sprechen/audio/webPlayer` — an `HTMLAudioElement` adapter
 * replacing mobile's expo-audio adapter; see that file.
 *
 * Web delta (mirrors `@/learner/hoeren/hooks/useHoerenAudio`'s P1b fix):
 * `HTMLAudioElement.play()` returns a promise that can reject *after* the
 * synchronous call returns (e.g. a browser autoplay-policy rejection).
 * Mobile's sync `try/catch` around `native.play()` can't see that — `play`
 * here additionally chains a `.catch()` onto the native call's return
 * value and dispatches the same `ERROR play_failed` the sync path uses,
 * plus `stopTick()` (the tick loop is already running by the time the
 * rejection lands, unlike mobile's sync throw which never reaches
 * `startTick`). See the S7 plan's P13: mic-check playback and the
 * Feedback screen's auto-play both call `play()` from a timer/effect
 * callback with no user gesture in the call stack, which headless
 * Chromium's autoplay policy rejects without the
 * `--autoplay-policy=no-user-gesture-required` flag.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createWebPlayer } from "../audio/webPlayer";

export type AudioReplayStatus =
  | "idle"
  | "loading"
  | "ready"
  | "playing"
  | "paused"
  | "ended"
  | "error";

export type AudioReplaySnapshot = {
  status: AudioReplayStatus;
  positionSec: number;
  durationSec: number;
  errorMessage: string | null;
};

export const INITIAL_AUDIO_REPLAY_SNAPSHOT: AudioReplaySnapshot = {
  status: "idle",
  positionSec: 0,
  durationSec: 0,
  errorMessage: null,
};

/**
 * Minimal shape the hook needs from the underlying native module. Member
 * set verbatim from mobile's `NativePlayer`, except `play`'s return type
 * widens to `void | Promise<void>` (Web delta — see file doc comment).
 */
export interface NativePlayer {
  /** Create (or replace) the underlying player for `url` and prepare it. */
  load: (url: string) => void;
  play: () => void | Promise<void>;
  pause: () => void;
  /**
   * Snapshot the current playback state. Polled by the hook to drive
   * `positionSec` + end-of-clip detection. Returns `null` before the
   * first status frame is available.
   */
  pollStatus: () => {
    positionSec: number;
    durationSec: number;
    playing: boolean;
    isLoaded: boolean;
    didJustFinish: boolean;
  } | null;
  /** Tear the player down and release its resources. */
  release: () => void;
}

/**
 * Pure state-machine transitions. Byte-comparable against mobile's
 * `reduceAudioReplay`. Tests cover this directly.
 */
export type AudioReplayEvent =
  | { type: "LOAD" }
  | { type: "PLAY" }
  | { type: "PAUSE" }
  | {
      type: "TICK";
      positionSec: number;
      durationSec: number;
      isLoaded: boolean;
    }
  | { type: "ENDED"; durationSec: number }
  | { type: "ERROR"; message: string }
  | { type: "RESET" };

export function reduceAudioReplay(
  state: AudioReplaySnapshot,
  event: AudioReplayEvent
): AudioReplaySnapshot {
  switch (event.type) {
    case "LOAD":
      return {
        status: "loading",
        positionSec: 0,
        durationSec: 0,
        errorMessage: null,
      };
    case "PLAY":
      if (state.status === "error") return state;
      return { ...state, status: "playing", errorMessage: null };
    case "PAUSE":
      if (state.status !== "playing") return state;
      return { ...state, status: "paused" };
    case "TICK": {
      if (state.status === "error" || state.status === "idle") return state;
      const status: AudioReplayStatus =
        state.status === "loading" && event.isLoaded ? "ready" : state.status;
      return {
        ...state,
        status,
        positionSec: event.positionSec,
        durationSec: event.durationSec || state.durationSec,
      };
    }
    case "ENDED":
      return {
        ...state,
        status: "ended",
        positionSec: event.durationSec || state.durationSec,
        durationSec: event.durationSec || state.durationSec,
      };
    case "ERROR":
      return { ...state, status: "error", errorMessage: event.message };
    case "RESET":
      return INITIAL_AUDIO_REPLAY_SNAPSHOT;
    default:
      return state;
  }
}

export type UseAudioReplayApi = AudioReplaySnapshot & {
  /** Hand the hook a fresh URL and prepare the native player. */
  load: (url: string) => void;
  play: () => void;
  pause: () => void;
  reset: () => void;
};

/** Polling cadence for the playback head (ms). */
const TICK_INTERVAL_MS = 250;

/**
 * Hook that owns the playback state. When no native module is available,
 * `load()` resolves into an `error` state with message
 * `"player_unavailable"` so the UI can hide or disable the control.
 */
export function useAudioReplay(
  nativeFactory: () => NativePlayer | null = createWebPlayer
): UseAudioReplayApi {
  const [state, setState] = useState<AudioReplaySnapshot>(INITIAL_AUDIO_REPLAY_SNAPSHOT);
  const nativeRef = useRef<NativePlayer | null>(null);
  const tickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const dispatch = useCallback((event: AudioReplayEvent) => {
    setState((prev) => reduceAudioReplay(prev, event));
  }, []);

  const native = useMemo(() => {
    if (nativeRef.current) return nativeRef.current;
    const resolved = nativeFactory();
    nativeRef.current = resolved;
    return resolved;
  }, [nativeFactory]);

  const stopTick = useCallback(() => {
    if (tickTimerRef.current !== null) {
      clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    }
  }, []);

  const startTick = useCallback(() => {
    stopTick();
    tickTimerRef.current = setInterval(() => {
      const status = native?.pollStatus() ?? null;
      if (!status) return;
      if (status.didJustFinish) {
        stopTick();
        dispatch({ type: "ENDED", durationSec: status.durationSec });
        return;
      }
      dispatch({
        type: "TICK",
        positionSec: status.positionSec,
        durationSec: status.durationSec,
        isLoaded: status.isLoaded,
      });
    }, TICK_INTERVAL_MS);
  }, [dispatch, native, stopTick]);

  const load = useCallback(
    (url: string): void => {
      if (!native) {
        dispatch({ type: "ERROR", message: "player_unavailable" });
        return;
      }
      try {
        native.load(url);
        dispatch({ type: "LOAD" });
        startTick();
      } catch {
        stopTick();
        dispatch({ type: "ERROR", message: "load_failed" });
      }
    },
    [dispatch, native, startTick, stopTick]
  );

  const play = useCallback((): void => {
    if (!native) {
      dispatch({ type: "ERROR", message: "player_unavailable" });
      return;
    }
    try {
      // Web delta: see file doc comment — HTMLAudioElement.play()'s
      // promise can reject asynchronously (autoplay policy) after this
      // call returns; the sync catch below can't see that, so a rejected
      // promise also stops the tick loop and dispatches play_failed.
      Promise.resolve(native.play()).catch(() => {
        stopTick();
        dispatch({ type: "ERROR", message: "play_failed" });
      });
      dispatch({ type: "PLAY" });
      startTick();
    } catch {
      dispatch({ type: "ERROR", message: "play_failed" });
    }
  }, [dispatch, native, startTick, stopTick]);

  const pause = useCallback((): void => {
    if (!native) return;
    try {
      native.pause();
    } catch {
      // Non-fatal — the reducer still moves to `paused`.
    }
    dispatch({ type: "PAUSE" });
  }, [dispatch, native]);

  const reset = useCallback((): void => {
    stopTick();
    native?.release();
    dispatch({ type: "RESET" });
  }, [dispatch, native, stopTick]);

  useEffect(() => {
    return () => {
      stopTick();
      nativeRef.current?.release();
    };
  }, [stopTick]);

  return {
    ...state,
    load,
    play,
    pause,
    reset,
  };
}
