/**
 * `useSprechenSession` — state machine that owns one full Sprechen
 * monologue attempt end to end (S7 · Task 7.4).
 *
 * Port of `deutschfit-mobile/src/features/sprechen/hooks/useSprechenSession.ts`
 * with the mock-leg / fixture branches stripped per plan P1 + anti-
 * requirement 2:
 *   - No `source: "coach" | "modelltests-single" | "mock-leg"` param, no
 *     `onResolve` callback — web hardcodes `source: "apprendre"` at the
 *     screen level (P1); this hook has no opinion on `source` at all.
 *   - No `evaluatePrompt` / `SprechenFeedback` fixture — the deterministic
 *     77/100 fixture is dead (anti-requirement 2). `submission` is read
 *     directly by the screen via `ModuleResultLayout` (P7/P8).
 *
 * Phases the screen renders against:
 *
 *   `prep`      → learner is reading the prompt. Default landing phase.
 *   `record`    → learner is capturing their monologue.
 *   `review`    → recording stopped (#373); learner replays their own
 *                 local clip and decides to re-record (`reset`) or
 *                 `submitRecording`. Nothing has left the device yet.
 *   `submit`    → 4-step upload in flight: `reserveUpload` →
 *                 `getRecordingBlob(uri)` → `putAudio` (content-type is
 *                 the registry blob's own negotiated type, P3 — never a
 *                 hardcoded value, web delta vs mobile's `"audio/mp4"`) →
 *                 `finalize`.
 *   `awaiting`  → upload landed, grader is working. The poller keeps
 *                 running in the background; the screen owns the
 *                 optimistic-dismiss UX (P10) — out of scope here.
 *   `done`      → grader landed (`graded`); `submission` is renderable.
 *   `fallback`  → any network / grader failure, a deterministic backend
 *                 rejection, or the 240s polling timeout. `error` carries
 *                 the code (`no_recording`, the server's `error` string,
 *                 or `grading_timeout`).
 *
 * Auto-stop cap wiring (#380 — stopping the recorder once it reaches the
 * prompt's duration cap) stays in the screen, same as mobile — this hook
 * only reacts to `reviewRecording` / `submitRecording` calls, it never
 * touches the recorder.
 *
 * Test seams: every external dependency is dispatched through `deps` so
 * unit tests can inject fakes without `vi.mock`'ing the api or the
 * polling module. Defaults read from the real implementations.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { trackEvent } from "@/learner/core/analytics/posthog";
import {
  finalize as defaultFinalize,
  putAudio as defaultPutAudio,
  reserveUpload as defaultReserveUpload,
  type SprechenSubmission,
  type SprechenTeil,
} from "@/learner/core/api/examApi";

import { getRecordingBlob as defaultGetRecordingBlob } from "../audio/webRecorder";
import { createSprechenPoller, type SprechenPollingSnapshot } from "./useSprechenSubmissionPolling";

export type SprechenSessionPhase =
  | "prep"
  | "record"
  | "review"
  | "submit"
  | "awaiting"
  | "done"
  | "fallback";

/** The two subgenres Wave 2 grades — mirrors `finalize()`'s wire type. */
export type MonologueSubgenre = "praesentation" | "vortrag";

export type SprechenSessionDeps = {
  readonly reserveUpload?: typeof defaultReserveUpload;
  readonly putAudio?: typeof defaultPutAudio;
  readonly finalize?: typeof defaultFinalize;
  /** Test seam — lets unit tests script the recorder-adapter registry lookup. */
  readonly getRecordingBlob?: typeof defaultGetRecordingBlob;
  /**
   * Test seam — lets the unit tests substitute the polling factory so
   * they can drive `graded` / `failed`/`error`/`rejected` / `timeout`
   * synchronously without a 5s real-time tick.
   */
  readonly createPoller?: typeof createSprechenPoller;
};

export type UseSprechenSessionArgs = {
  readonly examSlug: string;
  readonly teil: SprechenTeil;
  /** Curated (or community-authored) topic id — always resolved by the time the screen mounts this hook (P18). */
  readonly topicId: string;
  readonly subgenre: MonologueSubgenre;
  /** Upper-case cert code forwarded to `sprechen-upload`. */
  readonly cert?: string;
  /** Upper-case CEFR level forwarded to `sprechen-upload` / `sprechen-finalize`. */
  readonly level?: string;
  readonly deps?: SprechenSessionDeps;
};

export type UseSprechenSessionState = {
  readonly phase: SprechenSessionPhase;
  /** Stable error code (`no_recording`, a server `error` string, `grading_timeout`, …) when in `fallback`. */
  readonly error: string | null;
  /** Set once `reserveUpload` resolves; lets the screen surface a recovery UX. */
  readonly submissionId: string | null;
  /**
   * Latest `sprechen_submissions` row surfaced by the poller. Null until
   * the first poll snapshot lands. Carries the unified v2 fields
   * (`schema_version`, `dimension_scores_json`, `feedback_json`,
   * `transcript_de`, `score`, `pass_status`, `rubric_profile`, …) that
   * `ModuleResultLayout` consumes directly.
   */
  readonly submission: SprechenSubmission | null;
  /** Mirror of the recording uri the learner just stopped. */
  readonly recordingUri: string | null;
  /** Mirror of the recorded duration in milliseconds. */
  readonly durationMs: number;
};

export type UseSprechenSessionApi = UseSprechenSessionState & {
  /** Move from `prep` to `record`. Idempotent. */
  startRecording: () => void;
  /**
   * Move from `record` to `review` once `stop()` resolves (#373). The
   * clip stays on-device — the learner replays it and then chooses to
   * re-record (`reset`) or `submitRecording`. Mirrors `submitRecording`'s
   * no-uri fallback so a `recorder_unavailable` build still degrades
   * gracefully.
   */
  reviewRecording: (args: {
    readonly recordingUri: string | null;
    readonly durationMs: number;
  }) => void;
  /**
   * Hand the captured recording to the session. Kicks off the 4-step
   * upload; the screen still owns the recorder lifecycle (start / stop /
   * permission), this only owns what happens *after* the learner taps
   * "Soumettre" in the review phase. Re-entrant while a previous call is
   * still in flight is a no-op (re-entrancy ref — StrictMode double-
   * invoke / double-tap safety).
   */
  submitRecording: (args: {
    readonly recordingUri: string | null;
    readonly durationMs: number;
  }) => void;
  /** Move from `awaiting` → `done` (used when the popup surfaces the result). */
  acknowledgeResult: () => void;
  /**
   * Reset the session back to `prep`. Aborts any in-flight upload / poll.
   * The screen calls this when the learner taps "rerecord" on the
   * fallback banner or "Reprendre" in the review phase.
   */
  reset: () => void;
};

const INITIAL_RECORDING_URI: string | null = null;
const INITIAL_DURATION_MS = 0;

function initialState(): UseSprechenSessionState {
  return {
    phase: "prep",
    error: null,
    submissionId: null,
    submission: null,
    recordingUri: INITIAL_RECORDING_URI,
    durationMs: INITIAL_DURATION_MS,
  };
}

export function useSprechenSession(args: UseSprechenSessionArgs): UseSprechenSessionApi {
  const { examSlug, teil, topicId, subgenre, cert, level } = args;
  const deps = args.deps ?? {};
  const reserveFn = deps.reserveUpload ?? defaultReserveUpload;
  const putFn = deps.putAudio ?? defaultPutAudio;
  const finalizeFn = deps.finalize ?? defaultFinalize;
  const getRecordingBlobFn = deps.getRecordingBlob ?? defaultGetRecordingBlob;
  const createPoller = deps.createPoller ?? createSprechenPoller;

  const [state, setState] = useState<UseSprechenSessionState>(initialState);

  const cancelledRef = useRef(false);
  const pollerRef = useRef<ReturnType<typeof createSprechenPoller> | null>(null);
  // Re-entrancy ref — a second `submitRecording()` call while one is
  // already running the upload sequence is a no-op (StrictMode double-
  // invoke / accidental double-tap safety).
  const submitInFlightRef = useRef(false);

  const stopPoller = useCallback((): void => {
    if (pollerRef.current) {
      pollerRef.current.stop();
      pollerRef.current = null;
    }
  }, []);

  const startRecording = useCallback((): void => {
    setState((prev) =>
      prev.phase === "record" ? prev : { ...prev, phase: "record", error: null }
    );
  }, []);

  const acknowledgeResult = useCallback((): void => {
    setState((prev) => (prev.phase === "done" ? prev : { ...prev, phase: "done" }));
  }, []);

  const reset = useCallback((): void => {
    cancelledRef.current = true;
    stopPoller();
    cancelledRef.current = false;
    setState(initialState());
  }, [stopPoller]);

  const reviewRecording = useCallback(
    (input: { recordingUri: string | null; durationMs: number }): void => {
      const { recordingUri, durationMs } = input;

      // No recording available (e.g. `recorder_unavailable` on this
      // browser). Mirror `submitRecording`'s no-uri path — there is
      // nothing to review, so fall straight through to `fallback`.
      if (!recordingUri) {
        trackEvent("sprechen_submit_no_recording", {
          prompt_id: topicId,
          teil,
          duration_ms: durationMs,
        });
        setState({
          phase: "fallback",
          error: "no_recording",
          submissionId: null,
          submission: null,
          recordingUri: null,
          durationMs,
        });
        return;
      }

      setState({
        phase: "review",
        error: null,
        submissionId: null,
        submission: null,
        recordingUri,
        durationMs,
      });
    },
    [teil, topicId]
  );

  const submitRecording = useCallback(
    (input: { recordingUri: string | null; durationMs: number }): void => {
      const { recordingUri, durationMs } = input;

      // No recording available — fall back immediately, nothing to grade.
      if (!recordingUri) {
        trackEvent("sprechen_submit_no_recording", {
          prompt_id: topicId,
          teil,
          duration_ms: durationMs,
        });
        setState({
          phase: "fallback",
          error: "no_recording",
          submissionId: null,
          submission: null,
          recordingUri: null,
          durationMs,
        });
        return;
      }

      if (submitInFlightRef.current) return;
      submitInFlightRef.current = true;

      setState({
        phase: "submit",
        error: null,
        submissionId: null,
        submission: null,
        recordingUri,
        durationMs,
      });

      cancelledRef.current = false;

      const enterAwaiting = (id: string): void => {
        if (cancelledRef.current) return;
        setState({
          phase: "awaiting",
          error: null,
          submissionId: id,
          submission: null,
          recordingUri,
          durationMs,
        });
        stopPoller();
        pollerRef.current = createPoller(id, (snap: SprechenPollingSnapshot) => {
          if (cancelledRef.current) return;
          if (snap.status === "graded") {
            setState((prev) => ({
              ...prev,
              phase: "done",
              error: null,
              submissionId: id,
              submission: snap.data ?? prev.submission,
              recordingUri,
              durationMs,
            }));
            return;
          }
          if (snap.status === "failed" || snap.status === "error" || snap.status === "rejected") {
            setState((prev) => ({
              phase: "fallback",
              error: snap.data?.error_message ?? snap.error ?? "grading_failed",
              submissionId: id,
              submission: snap.data ?? prev.submission,
              recordingUri,
              durationMs,
            }));
            return;
          }
          if (snap.status === "timeout") {
            setState((prev) => ({
              phase: "fallback",
              error: "grading_timeout",
              submissionId: id,
              submission: snap.data ?? prev.submission,
              recordingUri,
              durationMs,
            }));
            return;
          }
          // queued / in_progress / awaiting_upload → stay in `awaiting`,
          // but mirror the latest row so consumers reading `submission`
          // see live status (without a phase change).
          if (snap.data) {
            const latest = snap.data;
            setState((prev) =>
              prev.submission === latest ? prev : { ...prev, submission: latest }
            );
          }
        });
        pollerRef.current.start();
      };

      const run = async (): Promise<void> => {
        try {
          const reservation = await reserveFn({
            examSlug,
            teil,
            clientSubmissionId: `${topicId}-${Date.now()}`,
            ...(cert ? { cert } : {}),
            ...(level ? { level } : {}),
          });
          if (cancelledRef.current) return;

          const entry = getRecordingBlobFn(recordingUri);
          if (!entry) {
            throw new Error("recording_not_found");
          }
          if (cancelledRef.current) return;

          // P3 — content-type is always the registry blob's own
          // negotiated type, never a hardcoded value (web delta vs
          // mobile's `"audio/mp4"`).
          await putFn(reservation.signed_put_url, entry.blob, entry.mimeType);
          if (cancelledRef.current) return;

          // Web delta: brief-pinned full finalize tuple (grader routing +
          // prompt hydration server-side) — mobile's current hook body
          // under-sends `{submissionId}` only; confirm parity before the
          // picker screens ship (7.6/7.7).
          await finalizeFn({
            submissionId: reservation.submission_id,
            subgenre,
            ...(level ? { level } : {}),
            topicId,
            durationSec: Math.floor(durationMs / 1000),
          });
          if (cancelledRef.current) return;

          enterAwaiting(reservation.submission_id);
        } catch (err) {
          if (cancelledRef.current) return;
          const code = err instanceof Error ? err.message : "upload_failed";
          setState({
            phase: "fallback",
            error: code,
            // Mirrors mobile's fallback state: submissionId resets to null on
            // ANY submit failure (even post-reserve) — same quirk, not
            // web-specific. Recovery UX tracked as a future parity task.
            submissionId: null,
            submission: null,
            recordingUri,
            durationMs,
          });
        } finally {
          submitInFlightRef.current = false;
        }
      };

      void run();
    },
    [
      cert,
      createPoller,
      examSlug,
      finalizeFn,
      getRecordingBlobFn,
      level,
      putFn,
      reserveFn,
      stopPoller,
      subgenre,
      teil,
      topicId,
    ]
  );

  // Tear down any in-flight poller / upload on unmount.
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      stopPoller();
    };
  }, [stopPoller]);

  return {
    ...state,
    startRecording,
    reviewRecording,
    submitRecording,
    acknowledgeResult,
    reset,
  };
}
