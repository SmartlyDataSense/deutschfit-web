/**
 * Recorder hook for the Sprechen flow (web).
 *
 * Verbatim port of deutschfit-mobile's `useRecorder` reducer + hook
 * (`src/features/sprechen/hooks/useRecorder.ts:31-409`) — same statuses,
 * same 45-sample metering window / −60dBFS normalization
 * (`normalizeMetering`/`appendLevel`), same 100ms tick cadence, same error
 * strings (`recorder_unavailable` / `permission_request_failed` /
 * `permission_denied` / `start_failed` / `stop_failed`), same F-028
 * stop-return contract (`stop()` resolves `{uri, durationMs}` directly —
 * callers must use the returned value, never `recorder.uri` read in the
 * same tick, since the `STOP_SUCCESS` state update isn't visible until the
 * next render).
 *
 * The concrete native module moves to
 * `@/learner/sprechen/audio/webRecorder` — a MediaRecorder + AnalyserNode
 * adapter replacing mobile's expo-audio adapter (P4); see that file.
 * Mobile resolves its native module lazily via `resolveNativeRecorder` (a
 * `require("expo-audio")` guard that returns `null` when the native module
 * can't be resolved). The web analog is `createWebRecorder`, which never
 * returns `null` itself — constructing the adapter object touches no
 * browser API — so `start()` below carries a tagged Web delta that detects
 * the "this browser can't record at all" case at the first real capability
 * check instead.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createWebRecorder } from "../audio/webRecorder";

export type RecorderStatus = "idle" | "requesting" | "recording" | "stopped" | "error";

export type RecorderPermission = "unknown" | "granted" | "denied";

export type RecorderSnapshot = {
  status: RecorderStatus;
  permission: RecorderPermission;
  durationMs: number;
  uri: string | null;
  errorMessage: string | null;
  levels: readonly number[];
};

export const INITIAL_RECORDER_SNAPSHOT: RecorderSnapshot = {
  status: "idle",
  permission: "unknown",
  durationMs: 0,
  uri: null,
  errorMessage: null,
  levels: [],
};

/** Number of metering samples kept in the sliding window. Matches the
 * `Waveform` primitive's default bar count so each bar maps 1:1 to a
 * metering sample. */
export const LEVELS_WINDOW = 45;

/**
 * Convert a dBFS metering value (range ≈ −160…0) to a normalized 0…1
 * amplitude suitable for waveform bars. Values below −60 dB collapse to
 * silence so the bars don't stay visually maxed by mic noise floor.
 */
export function normalizeMetering(metering: number): number {
  if (!Number.isFinite(metering)) return 0;
  const floor = -60;
  if (metering <= floor) return 0;
  if (metering >= 0) return 1;
  // Linear map −60 dB → 0, 0 dB → 1.
  return (metering - floor) / -floor;
}

/**
 * Append a new amplitude to the sliding window, dropping the oldest.
 * Pure helper — kept top-level so the reducer stays straightforward to
 * unit-test.
 */
export function appendLevel(
  prev: readonly number[],
  next: number,
  windowSize: number = LEVELS_WINDOW
): number[] {
  const value = next < 0 ? 0 : next > 1 ? 1 : next;
  if (prev.length < windowSize) {
    return [...prev, value];
  }
  return [...prev.slice(prev.length - windowSize + 1), value];
}

/**
 * Minimal shape the hook needs from the underlying native module. Member
 * set verbatim from mobile's `NativeRecorder` — mobile wins.
 */
export interface NativeRecorder {
  requestPermissions: () => Promise<{ granted: boolean }>;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<{ uri: string; durationMs: number }>;
  /**
   * Snapshot the current recorder state. Polled by the hook to drive
   * `durationMs` + `levels`. Returns `null` when no metering value is
   * available (e.g. before the first audio buffer is captured).
   */
  pollStatus: () => { durationMs: number; metering: number | null } | null;
}

/**
 * Pure state-machine transitions. Tests cover this directly.
 */
export type RecorderEvent =
  | { type: "REQUEST_PERMISSION" }
  | { type: "PERMISSION_RESULT"; granted: boolean }
  | { type: "START" }
  | { type: "TICK"; durationMs: number; level: number | null }
  | { type: "STOP_SUCCESS"; uri: string; durationMs: number }
  | { type: "ERROR"; message: string }
  | { type: "RESET" };

export function reduceRecorder(state: RecorderSnapshot, event: RecorderEvent): RecorderSnapshot {
  switch (event.type) {
    case "REQUEST_PERMISSION":
      return { ...state, status: "requesting", errorMessage: null };
    case "PERMISSION_RESULT":
      return {
        ...state,
        status: event.granted ? "idle" : "error",
        permission: event.granted ? "granted" : "denied",
        errorMessage: event.granted ? null : "permission_denied",
      };
    case "START":
      return {
        ...state,
        status: "recording",
        durationMs: 0,
        uri: null,
        errorMessage: null,
        levels: [],
      };
    case "TICK": {
      if (state.status !== "recording") return state;
      const nextLevels =
        event.level !== null ? appendLevel(state.levels, event.level) : state.levels;
      return { ...state, durationMs: event.durationMs, levels: nextLevels };
    }
    case "STOP_SUCCESS":
      return {
        ...state,
        status: "stopped",
        durationMs: event.durationMs,
        uri: event.uri,
        errorMessage: null,
      };
    case "ERROR":
      return {
        ...state,
        status: "error",
        errorMessage: event.message,
      };
    case "RESET":
      return INITIAL_RECORDER_SNAPSHOT;
    default:
      return state;
  }
}

export type UseRecorderApi = RecorderSnapshot & {
  requestPermission: () => Promise<void>;
  start: () => Promise<void>;
  /**
   * Stop the active recording and return the captured `{uri, durationMs}`
   * directly to the caller. Callers MUST prefer the returned value over
   * reading `recorder.uri` / `recorder.durationMs` in the same tick —
   * React state from `STOP_SUCCESS` won't be visible until the next
   * render, so closures captured before `stop()` resolves still see the
   * pre-stop `null` uri (F-028). On error paths we resolve with
   * `{ uri: "", durationMs: 0 }` so callers can treat empty `uri` as a
   * bail without changing their type signature.
   */
  stop: () => Promise<{ uri: string; durationMs: number }>;
  reset: () => void;
};

/** Polling cadence for metering + duration ticks (ms). */
const TICK_INTERVAL_MS = 100;

/**
 * Hook that owns the recorder state. When no native module is available
 * (mobile parity: `nativeFactory()` returning `null` — reachable via a
 * test-injected factory, since the real `createWebRecorder` never returns
 * null itself), `requestPermission()`/`start()`/`stop()` resolve into an
 * `error` state with message `"recorder_unavailable"`.
 */
export function useRecorder(
  nativeFactory: () => NativeRecorder | null = createWebRecorder
): UseRecorderApi {
  const [state, setState] = useState<RecorderSnapshot>(INITIAL_RECORDER_SNAPSHOT);
  const nativeRef = useRef<NativeRecorder | null>(null);
  const tickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const dispatch = useCallback((event: RecorderEvent) => {
    setState((prev) => reduceRecorder(prev, event));
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
      const level = status.metering === null ? null : normalizeMetering(status.metering);
      dispatch({
        type: "TICK",
        durationMs: status.durationMs,
        level,
      });
    }, TICK_INTERVAL_MS);
  }, [dispatch, native, stopTick]);

  const requestPermission = useCallback(async (): Promise<void> => {
    dispatch({ type: "REQUEST_PERMISSION" });
    if (!native) {
      dispatch({ type: "ERROR", message: "recorder_unavailable" });
      return;
    }
    try {
      const res = await native.requestPermissions();
      dispatch({ type: "PERMISSION_RESULT", granted: res.granted });
    } catch {
      dispatch({ type: "ERROR", message: "permission_request_failed" });
    }
  }, [dispatch, native]);

  const start = useCallback(async (): Promise<void> => {
    if (!native) {
      dispatch({ type: "ERROR", message: "recorder_unavailable" });
      return;
    }
    try {
      await native.startRecording();
      dispatch({ type: "START" });
      startTick();
    } catch (err) {
      stopTick();
      // Web delta: `createWebRecorder().startRecording()` throws with the
      // exact message "recorder_unavailable" when the browser has no
      // usable MediaRecorder mimeType at all (P4 negotiation exhausted, or
      // no MediaRecorder global) — the web analog of mobile's
      // null-`nativeFactory()` gate, only detectable here since
      // `createWebRecorder()` itself never returns null. Surface that
      // exact message instead of collapsing it into the generic
      // "start_failed" mobile uses for every other startRecording()
      // failure (permission races, device errors, etc.).
      const message =
        err instanceof Error && err.message === "recorder_unavailable"
          ? "recorder_unavailable"
          : "start_failed";
      dispatch({ type: "ERROR", message });
    }
  }, [dispatch, native, startTick, stopTick]);

  const stop = useCallback(async (): Promise<{
    uri: string;
    durationMs: number;
  }> => {
    stopTick();
    if (!native) {
      dispatch({ type: "ERROR", message: "recorder_unavailable" });
      return { uri: "", durationMs: 0 };
    }
    try {
      const res = await native.stopRecording();
      dispatch({
        type: "STOP_SUCCESS",
        uri: res.uri,
        durationMs: res.durationMs,
      });
      return res;
    } catch {
      dispatch({ type: "ERROR", message: "stop_failed" });
      return { uri: "", durationMs: 0 };
    }
  }, [dispatch, native, stopTick]);

  const reset = useCallback((): void => {
    stopTick();
    dispatch({ type: "RESET" });
  }, [dispatch, stopTick]);

  useEffect(() => {
    return () => {
      stopTick();
    };
  }, [stopTick]);

  return {
    ...state,
    requestPermission,
    start,
    stop,
    reset,
  };
}
