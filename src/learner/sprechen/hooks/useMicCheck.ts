/**
 * One-shot mic + speaker check for the Sprechen Prep screen (web).
 *
 * Verbatim port of deutschfit-mobile's `useMicCheck` reducer + hook
 * (`deutschfit-mobile/src/features/sprechen/hooks/useMicCheck.ts:67-344`)
 * — same statuses (idle→requesting→recording→recorded→playing→done|error),
 * same errors (`permission_denied`/`recorder_unavailable`/`record_failed`/
 * `playback_failed`), same `MIC_CHECK_DURATION_MS = 5000` setTimeout
 * auto-stop, same auto-play-then-`onPassed()` flow.
 *
 * The native module (`NativeMicCheck`) composes two web adapters instead
 * of mobile's single expo-audio module: `createWebRecorder`
 * (`@/learner/sprechen/audio/webRecorder`, P4) for permission + capture,
 * and a local single-use `HTMLAudioElement` for `playUri` (a promise that
 * resolves on the `ended` event or rejects on a load/play failure —
 * mirrors mobile's expo-audio `playbackStatusUpdate` listener).
 *
 * Web delta (DECISION, 7.2 review): requestPermission()-time gating for
 * "this browser can't record at all" does not exist on web (unlike
 * mobile's `nativeFactory() === null` check) — `createWebRecorder()`
 * never returns `null` itself (constructing it touches no browser API),
 * so the "no usable MediaRecorder mimeType" case is only detectable once
 * `startRecording()` is actually called. `start()` below carries the same
 * technique `useRecorder.ts`'s `start()` uses: catch the thrown error and
 * preserve the exact `"recorder_unavailable"` message instead of
 * collapsing it into mobile's generic `record_failed` — mic-check always
 * records, so this is where the unsupported-browser case surfaces.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createWebRecorder } from "../audio/webRecorder";
import type { NativeRecorder } from "./useRecorder";

export const MIC_CHECK_DURATION_MS = 5000;

export type MicCheckStatus =
  | "idle"
  | "requesting"
  | "recording"
  | "recorded"
  | "playing"
  | "done"
  | "error";

export type MicCheckErrorCode =
  | "permission_denied"
  | "recorder_unavailable"
  | "record_failed"
  | "playback_failed";

export type MicCheckSnapshot = {
  status: MicCheckStatus;
  errorMessage: MicCheckErrorCode | null;
  uri: string | null;
};

export const INITIAL_MIC_CHECK_SNAPSHOT: MicCheckSnapshot = {
  status: "idle",
  errorMessage: null,
  uri: null,
};

export type MicCheckEvent =
  | { type: "REQUEST" }
  | { type: "RECORDING_STARTED" }
  | { type: "RECORDING_STOPPED"; uri: string }
  | { type: "PLAYBACK_STARTED" }
  | { type: "PLAYBACK_FINISHED" }
  | { type: "ERROR"; message: MicCheckErrorCode }
  | { type: "RESET" };

/**
 * Pure state-machine transitions. Byte-comparable against mobile's
 * `reduceMicCheck`. Tests cover this directly.
 */
export function reduceMicCheck(state: MicCheckSnapshot, event: MicCheckEvent): MicCheckSnapshot {
  switch (event.type) {
    case "REQUEST":
      return { ...state, status: "requesting", errorMessage: null };
    case "RECORDING_STARTED":
      return { ...state, status: "recording", errorMessage: null };
    case "RECORDING_STOPPED":
      return { ...state, status: "recorded", uri: event.uri };
    case "PLAYBACK_STARTED":
      return { ...state, status: "playing" };
    case "PLAYBACK_FINISHED":
      return { ...state, status: "done" };
    case "ERROR":
      return { ...state, status: "error", errorMessage: event.message };
    case "RESET":
      return INITIAL_MIC_CHECK_SNAPSHOT;
    default:
      return state;
  }
}

/**
 * Minimal native shape the hook depends on. The composed web adapter
 * (`createWebMicCheck`, below) satisfies it; tests can pass a fake
 * factory.
 */
export interface NativeMicCheck {
  requestPermissions: () => Promise<{ granted: boolean }>;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<{ uri: string }>;
  /**
   * Plays back a previously recorded URI. The promise resolves when
   * playback ends naturally, or rejects on a load/play error.
   */
  playUri: (uri: string) => Promise<void>;
  /** Tear down the active player and any in-progress recording. */
  release: () => void;
}

/**
 * Compose the web `NativeMicCheck`: `createWebRecorder` for permission +
 * capture, plus a local single-use `HTMLAudioElement` for `playUri`.
 * Never returns `null` itself — see the file doc comment; the
 * `recorder_unavailable` path is detected inside `useMicCheck`'s `start()`
 * instead (DECISION, 7.2 review).
 */
export function createWebMicCheck(
  createElement: () => HTMLAudioElement = () => new Audio()
): NativeMicCheck {
  const recorder: NativeRecorder = createWebRecorder();
  let isRecording = false;
  let audioEl: HTMLAudioElement | null = null;
  let endedListener: (() => void) | null = null;

  const releasePlayer = () => {
    if (audioEl) {
      if (endedListener) audioEl.removeEventListener("ended", endedListener);
      audioEl.pause();
      audioEl.removeAttribute("src");
    }
    audioEl = null;
    endedListener = null;
  };

  return {
    requestPermissions: () => recorder.requestPermissions(),

    async startRecording() {
      await recorder.startRecording();
      isRecording = true;
    },

    async stopRecording() {
      const result = await recorder.stopRecording();
      isRecording = false;
      return { uri: result.uri };
    },

    playUri(uri: string) {
      releasePlayer();
      return new Promise<void>((resolve, reject) => {
        const el = createElement();
        audioEl = el;
        endedListener = () => {
          releasePlayer();
          resolve();
        };
        el.addEventListener("ended", endedListener);
        el.src = uri;
        Promise.resolve(el.play()).catch((err: unknown) => {
          releasePlayer();
          reject(err instanceof Error ? err : new Error("playback_failed"));
        });
      });
    },

    release() {
      releasePlayer();
      if (isRecording) {
        isRecording = false;
        // Web delta: mobile's release() calls the native recorder
        // instance's own `.stop()` to release the mic mid-recording (the
        // 5s window before the setTimeout auto-stop fires); the web
        // equivalent teardown is `stopRecording()` on the same
        // `createWebRecorder` instance — fire-and-forget, the returned
        // uri is discarded since `RESET` has already fired.
        void recorder.stopRecording().catch(() => {});
      }
    },
  };
}

export type UseMicCheckApi = MicCheckSnapshot & {
  start: () => Promise<void>;
  reset: () => void;
};

export type UseMicCheckOptions = {
  nativeFactory?: () => NativeMicCheck | null;
  onPassed?: () => void;
  durationMs?: number;
};

/**
 * Owns the mic-check state machine. `start()` requests permission, records
 * for `durationMs` (default 5000), then plays the clip back. When playback
 * finishes naturally the hook calls `onPassed` so callers can persist the
 * device-scoped `useMicCheckFlag`.
 */
export function useMicCheck(options: UseMicCheckOptions = {}): UseMicCheckApi {
  const {
    nativeFactory = createWebMicCheck,
    onPassed,
    durationMs = MIC_CHECK_DURATION_MS,
  } = options;

  const [state, setState] = useState<MicCheckSnapshot>(INITIAL_MIC_CHECK_SNAPSHOT);
  const nativeRef = useRef<NativeMicCheck | null>(null);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onPassedRef = useRef(onPassed);

  useEffect(() => {
    onPassedRef.current = onPassed;
  }, [onPassed]);

  const dispatch = useCallback((event: MicCheckEvent) => {
    setState((prev) => reduceMicCheck(prev, event));
  }, []);

  const native = useMemo(() => {
    if (nativeRef.current) return nativeRef.current;
    const resolved = nativeFactory();
    nativeRef.current = resolved;
    return resolved;
  }, [nativeFactory]);

  const clearStopTimer = useCallback(() => {
    if (stopTimerRef.current !== null) {
      clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
  }, []);

  const start = useCallback(async (): Promise<void> => {
    if (!native) {
      dispatch({ type: "ERROR", message: "recorder_unavailable" });
      return;
    }
    dispatch({ type: "REQUEST" });
    try {
      const perm = await native.requestPermissions();
      if (!perm.granted) {
        dispatch({ type: "ERROR", message: "permission_denied" });
        return;
      }
    } catch {
      dispatch({ type: "ERROR", message: "permission_denied" });
      return;
    }

    let uri: string;
    try {
      await native.startRecording();
      dispatch({ type: "RECORDING_STARTED" });
      const stopped = new Promise<{ uri: string }>((resolve, reject) => {
        stopTimerRef.current = setTimeout(() => {
          stopTimerRef.current = null;
          native.stopRecording().then(resolve, reject);
        }, durationMs);
      });
      const result = await stopped;
      uri = result.uri;
      dispatch({ type: "RECORDING_STOPPED", uri });
    } catch (err) {
      clearStopTimer();
      // Web delta — see file doc comment (DECISION, 7.2 review): preserve
      // the exact "recorder_unavailable" message from `createWebRecorder`
      // instead of collapsing every startRecording()/stopRecording()
      // failure into mobile's generic "record_failed".
      const message: MicCheckErrorCode =
        err instanceof Error && err.message === "recorder_unavailable"
          ? "recorder_unavailable"
          : "record_failed";
      dispatch({ type: "ERROR", message });
      return;
    }

    try {
      dispatch({ type: "PLAYBACK_STARTED" });
      await native.playUri(uri);
      dispatch({ type: "PLAYBACK_FINISHED" });
      onPassedRef.current?.();
    } catch {
      dispatch({ type: "ERROR", message: "playback_failed" });
    }
  }, [clearStopTimer, dispatch, durationMs, native]);

  const reset = useCallback((): void => {
    clearStopTimer();
    native?.release();
    dispatch({ type: "RESET" });
  }, [clearStopTimer, dispatch, native]);

  useEffect(() => {
    return () => {
      clearStopTimer();
      nativeRef.current?.release();
    };
  }, [clearStopTimer]);

  return {
    ...state,
    start,
    reset,
  };
}
