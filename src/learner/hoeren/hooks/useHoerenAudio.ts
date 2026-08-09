/**
 * Audio playback hook for the Hören practice player (web).
 *
 * Verbatim port of deutschfit-mobile's `useHoerenAudio` reducer + hook
 * (`src/features/hoeren/hooks/useHoerenAudio.ts:175-364`) — same statuses,
 * same 250ms poll cadence, same injectable-factory lifecycle, same error
 * strings (`player_unavailable` / `load_failed` / `play_failed`). The
 * native module surface (`HoerenNativePlayer`) moves to
 * `@/learner/core/audio/hoerenPlayer` — an `HTMLAudioElement` adapter
 * replacing mobile's expo-audio adapter; see that file.
 *
 * Web delta (P1b): `HTMLAudioElement.play()` returns a promise that can
 * reject *after* the synchronous call returns (e.g. a browser autoplay
 * policy rejection). Mobile's sync `try/catch` around `native.play()`
 * cannot see that. `play` and `replay` additionally chain a `.catch()`
 * onto the native call's return value and dispatch the same
 * `ERROR play_failed` the sync path uses.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createHtmlAudioPlayer, type HoerenNativePlayer } from "@/learner/core/audio/hoerenPlayer";

export type HoerenAudioStatus =
  | "idle"
  | "loading"
  | "ready"
  | "playing"
  | "paused"
  | "ended"
  | "error";

export type HoerenAudioSnapshot = {
  status: HoerenAudioStatus;
  positionSec: number;
  durationSec: number;
  errorMessage: string | null;
};

export const INITIAL_HOEREN_AUDIO_SNAPSHOT: HoerenAudioSnapshot = {
  status: "idle",
  positionSec: 0,
  durationSec: 0,
  errorMessage: null,
};

export type HoerenAudioEvent =
  | { type: "LOAD" }
  | { type: "PLAY" }
  | { type: "PAUSE" }
  | { type: "REPLAY" }
  | {
      type: "TICK";
      positionSec: number;
      durationSec: number;
      isLoaded: boolean;
    }
  | { type: "ENDED"; durationSec: number }
  | { type: "ERROR"; message: string }
  | { type: "RESET" };

export function reduceHoerenAudio(
  state: HoerenAudioSnapshot,
  event: HoerenAudioEvent
): HoerenAudioSnapshot {
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
    case "REPLAY":
      if (state.status === "error") return state;
      return {
        ...state,
        status: "playing",
        positionSec: 0,
        errorMessage: null,
      };
    case "TICK": {
      if (state.status === "error" || state.status === "idle") return state;
      const status: HoerenAudioStatus =
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
      return INITIAL_HOEREN_AUDIO_SNAPSHOT;
    default:
      return state;
  }
}

export type UseHoerenAudioApi = HoerenAudioSnapshot & {
  load: (url: string) => void;
  play: () => void;
  pause: () => void;
  /** Rewind to 0 and play from the start. */
  replay: () => void;
  reset: () => void;
};

/** Polling cadence for the playback head (ms). */
const TICK_INTERVAL_MS = 250;

export function useHoerenAudio(
  nativeFactory: () => HoerenNativePlayer | null = createHtmlAudioPlayer
): UseHoerenAudioApi {
  const [state, setState] = useState<HoerenAudioSnapshot>(INITIAL_HOEREN_AUDIO_SNAPSHOT);
  const nativeRef = useRef<HoerenNativePlayer | null>(null);
  const tickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const dispatch = useCallback((event: HoerenAudioEvent) => {
    setState((prev) => reduceHoerenAudio(prev, event));
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
      // Web delta: HTMLAudioElement.play() returns a promise that can
      // reject asynchronously (autoplay policy) after this call returns —
      // the sync catch below can't see that; chain a catch too.
      Promise.resolve(native.play()).catch(() => {
        dispatch({ type: "ERROR", message: "play_failed" });
      });
      dispatch({ type: "PLAY" });
      startTick();
    } catch {
      dispatch({ type: "ERROR", message: "play_failed" });
    }
  }, [dispatch, native, startTick]);

  const pause = useCallback((): void => {
    if (!native) return;
    try {
      native.pause();
    } catch {
      // Non-fatal — the reducer still moves to `paused`.
    }
    dispatch({ type: "PAUSE" });
  }, [dispatch, native]);

  const replay = useCallback((): void => {
    if (!native) {
      dispatch({ type: "ERROR", message: "player_unavailable" });
      return;
    }
    try {
      native.seekTo(0);
      // Web delta: see `play` above.
      Promise.resolve(native.play()).catch(() => {
        dispatch({ type: "ERROR", message: "play_failed" });
      });
      dispatch({ type: "REPLAY" });
      startTick();
    } catch {
      dispatch({ type: "ERROR", message: "play_failed" });
    }
  }, [dispatch, native, startTick]);

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
    replay,
    reset,
  };
}
