/**
 * Hook that owns the paired-Sprechen turn loop (S7 · Task 7.10).
 *
 * Verbatim port of
 * `deutschfit-mobile/src/features/sprechen/dialogue/hooks/useDialogueSession.ts`:
 *
 *   idle → starting → [opening partner turn plays] →
 *     awaiting_student → recording → uploading →
 *       awaiting_student (repeat) OR finalizing → graded | failed
 *
 * Responsibilities:
 *   - Open the session (`startDialogue`) and surface the opening partner
 *     turn so the screen can auto-play it. Per-teil config (labels, turn
 *     bounds, budget, theme) comes from the server response, not a static
 *     client table — board identity is data.
 *   - For each student turn, resolve the recorded `Blob` via
 *     `getRecordingBlob(fileUri)` (7.2, `../audio/webRecorder`), reserve a
 *     signed PUT URL, upload it, then call `sendDialogueTurn` with a
 *     per-turn `clientTurnId`. The id is held in a ref so a RETRY of the
 *     same turn after a transient failure replays the SAME id (P20); the
 *     backend dedups on `(session_id, client_turn_id)`. A fresh id is
 *     minted only once the previous turn succeeds.
 *   - Enforce the client-side time budget by ticking a wall-clock and
 *     surfacing `timeRemainingSec`. The turn wire carries no time field,
 *     so the tick is the sole owner of the countdown.
 *   - Call `finalizeDialogue` when the user ends the session, and stash
 *     the graded result in the non-persisted `useDialogueResult` store
 *     (`../resultStore`) so a later screen can read it without a second,
 *     non-idempotent finalize call. Finalize gating is advisory
 *     (`canFinalize` / `mustFinalize` from each turn); consumers read
 *     those flags, the hook itself never blocks finalize.
 *
 * The state machine is kept as a pure reducer (`reduceDialogue`) so it
 * can be unit-tested without a render tree.
 *
 * Web delta (M-2): when a turn response carries
 * `partnerTurn.audio_signed_url === null` (the idempotent-replay branch —
 * see `../../core/api/dialogue.ts` file header), the reducer passes that
 * `null` straight into `partnerAudioUrl`, landing in the exact same state
 * `markPartnerAudioConsumed()` produces. The screen's auto-play effect
 * reads `partnerAudioUrl` and no-ops on `null`, so replay turns render
 * their `text` (carried on the same `partnerTurn` object, unaffected by
 * the audio field) without attempting to play stale/absent audio.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";

import { newIdempotencyKey } from "@/learner/core/api/client";
import {
  finalizeDialogue,
  putStudentAudio,
  reserveStudentTurnUpload,
  sendDialogueTurn,
  startDialogue,
  type DialogueResult,
  type DialogueStartResult,
  type DialogueThemeWire,
  type DialogueTurnResult,
} from "@/learner/core/api/examApi";

import { getRecordingBlob as defaultGetRecordingBlob } from "../../audio/webRecorder";
import { useDialogueResult } from "../resultStore";

export type DialoguePhase =
  | "idle"
  | "starting"
  | "awaiting_student"
  | "recording"
  | "uploading"
  | "partner_responding"
  | "finalizing"
  | "graded"
  | "failed";

/** Local view-model for a transcript line. The wire contract has NO turn_index,
 *  so `index` is synthesized from history position. */
export type DialogueHistoryTurn = {
  readonly index: number;
  readonly speaker: "student" | "partner";
  readonly text: string;
};

/** Server-returned dynamic per-teil config (replaces a static client table). */
export type DialogueSessionConfig = {
  readonly dialogueTeilKey: string;
  readonly taskNativeLabel: string;
  readonly taskInstructionsDe: string;
  readonly theme: DialogueThemeWire | null;
  readonly turnMin: number;
  readonly turnMax: number;
  readonly budgetSec: number;
};

export type DialogueState = {
  phase: DialoguePhase;
  sessionId: string | null;
  config: DialogueSessionConfig | null;
  history: DialogueHistoryTurn[];
  partnerAudioUrl: string | null;
  /** Server-reported count of completed student turns. */
  turnCount: number;
  timeRemainingSec: number;
  budgetSec: number;
  /** Server-authoritative finalize gating (from each turn response). */
  canFinalize: boolean;
  mustFinalize: boolean;
  grader: DialogueResult | null;
  errorMessage: string | null;
};

export const INITIAL_DIALOGUE_STATE: DialogueState = {
  phase: "idle",
  sessionId: null,
  config: null,
  history: [],
  partnerAudioUrl: null,
  turnCount: 0,
  timeRemainingSec: 0,
  budgetSec: 0,
  canFinalize: false,
  mustFinalize: false,
  grader: null,
  errorMessage: null,
};

export type DialogueAction =
  | { type: "START_REQUEST" }
  | { type: "START_SUCCESS"; response: DialogueStartResult }
  | { type: "RECORDING_STARTED" }
  | { type: "UPLOAD_STARTED" }
  | { type: "TURN_SUCCESS"; response: DialogueTurnResult }
  | { type: "TICK"; elapsedSec: number }
  | { type: "FINALIZE_REQUEST" }
  | { type: "FINALIZE_SUCCESS"; response: DialogueResult }
  | { type: "PARTNER_AUDIO_CONSUMED" }
  | { type: "ERROR"; message: string }
  | { type: "RESET" };

export function reduceDialogue(state: DialogueState, action: DialogueAction): DialogueState {
  switch (action.type) {
    case "START_REQUEST":
      return { ...INITIAL_DIALOGUE_STATE, phase: "starting" };
    case "START_SUCCESS": {
      const r = action.response;
      return {
        ...state,
        phase: "awaiting_student",
        sessionId: r.sessionId,
        config: {
          dialogueTeilKey: r.dialogueTeilKey,
          taskNativeLabel: r.taskNativeLabel,
          taskInstructionsDe: r.taskInstructionsDe,
          theme: r.theme,
          turnMin: r.turnMin,
          turnMax: r.turnMax,
          budgetSec: r.budgetSec,
        },
        history: [{ index: 0, speaker: "partner", text: r.partnerTurn.text }],
        partnerAudioUrl: r.partnerTurn.audio_signed_url,
        turnCount: 0,
        timeRemainingSec: r.budgetSec,
        budgetSec: r.budgetSec,
        canFinalize: false,
        mustFinalize: false,
        errorMessage: null,
      };
    }
    case "RECORDING_STARTED":
      if (state.phase !== "awaiting_student") return state;
      return { ...state, phase: "recording", errorMessage: null };
    case "UPLOAD_STARTED":
      if (state.phase !== "recording") return state;
      return { ...state, phase: "uploading" };
    case "TURN_SUCCESS": {
      const r = action.response;
      const baseIndex = state.history.length;
      const newHistory: DialogueHistoryTurn[] = [
        ...state.history,
        { index: baseIndex, speaker: "student", text: r.candidateText },
        { index: baseIndex + 1, speaker: "partner", text: r.partnerTurn.text },
      ];
      return {
        ...state,
        phase: "awaiting_student",
        history: newHistory,
        // Web delta (M-2): `audio_signed_url` may be `null` on an
        // idempotent-replay turn — passed through as-is, which lands in
        // the same "already consumed" state `markPartnerAudioConsumed()`
        // produces, so the screen skips auto-play for that turn.
        partnerAudioUrl: r.partnerTurn.audio_signed_url,
        turnCount: r.turnCount,
        canFinalize: r.canFinalize,
        mustFinalize: r.mustFinalize,
      };
    }
    case "TICK":
      if (state.phase === "graded" || state.phase === "failed") return state;
      if (state.budgetSec <= 0) return state;
      return {
        ...state,
        timeRemainingSec: Math.max(0, state.budgetSec - action.elapsedSec),
      };
    case "FINALIZE_REQUEST":
      return { ...state, phase: "finalizing" };
    case "FINALIZE_SUCCESS":
      return {
        ...state,
        phase: "graded",
        grader: action.response,
        errorMessage: null,
      };
    case "PARTNER_AUDIO_CONSUMED":
      return { ...state, partnerAudioUrl: null };
    case "ERROR":
      return { ...state, phase: "failed", errorMessage: action.message };
    case "RESET":
      return INITIAL_DIALOGUE_STATE;
    default:
      return state;
  }
}

export type DialogueDeps = {
  startDialogue: typeof startDialogue;
  reserveStudentTurnUpload: typeof reserveStudentTurnUpload;
  putStudentAudio: typeof putStudentAudio;
  sendDialogueTurn: typeof sendDialogueTurn;
  finalizeDialogue: typeof finalizeDialogue;
  /** Test seam — lets unit tests script the recorder-adapter registry lookup. */
  getRecordingBlob: typeof defaultGetRecordingBlob;
  now: () => number;
};

export type UseDialogueSessionApi = DialogueState & {
  start: (args: {
    board: string;
    level: string;
    teil: string;
    themeId?: string;
    voice?: string;
  }) => Promise<void>;
  submitStudentTurn: (args: { fileUri: string; userId: string; voice?: string }) => Promise<void>;
  finalize: () => Promise<void>;
  markPartnerAudioConsumed: () => void;
  reset: () => void;
};

const DEFAULT_DEPS: DialogueDeps = {
  startDialogue,
  reserveStudentTurnUpload,
  putStudentAudio,
  sendDialogueTurn,
  finalizeDialogue,
  getRecordingBlob: defaultGetRecordingBlob,
  now: () => Date.now(),
};

/** Single module-level default so the `useMemo`/`useCallback` graph isn't
 *  churned by a fresh `{}` literal on every render (matches
 *  `useSprechenSession`'s stable-default-deps idiom). */
const EMPTY_DEPS: Partial<DialogueDeps> = {};

export function useDialogueSession(
  depsOverride: Partial<DialogueDeps> = EMPTY_DEPS
): UseDialogueSessionApi {
  const deps = useMemo<DialogueDeps>(() => ({ ...DEFAULT_DEPS, ...depsOverride }), [depsOverride]);
  const [state, dispatch] = useReducer(reduceDialogue, INITIAL_DIALOGUE_STATE);
  const startEpochRef = useRef<number>(0);
  const tickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Per-turn idempotency key, held across retries; cleared on success. */
  const pendingTurnIdRef = useRef<string | null>(null);
  /** Re-entrancy guard: true while a `submitStudentTurn` is mid-flight so a
   *  second overlapping call can't clobber the same storage path / id. */
  const isSubmittingRef = useRef(false);
  /** Flipped true on unmount so an async write that resolves afterwards
   *  doesn't dispatch into a torn-down tree (mirrors `useSprechenSession`). */
  const cancelledRef = useRef(false);
  /** Monotonic per-run token. Each async op (`start`/`submitStudentTurn`/
   *  `finalize`) captures the value at entry; a `reset()` or fresh `start()`
   *  bumps it, so an older in-flight run is superseded and its late result is
   *  dropped before it dispatches. Chosen over a single boolean because the
   *  reducer has several concurrent async entry points and `reset()` does not
   *  unmount the hook. */
  const runGenerationRef = useRef(0);

  const stopTick = useCallback(() => {
    if (tickTimerRef.current !== null) {
      clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    }
  }, []);

  const startTick = useCallback(() => {
    stopTick();
    startEpochRef.current = deps.now();
    tickTimerRef.current = setInterval(() => {
      const elapsedSec = Math.floor((deps.now() - startEpochRef.current) / 1000);
      dispatch({ type: "TICK", elapsedSec });
    }, 1000);
  }, [deps, stopTick]);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      stopTick();
    };
  }, [stopTick]);

  const start = useCallback(
    async (args: {
      board: string;
      level: string;
      teil: string;
      themeId?: string;
      voice?: string;
    }) => {
      // Fresh session boundary: drop any pending id / in-flight flag from a
      // previous session and supersede any older in-flight run. This is
      // also what makes `start()` re-runnable after a boot failure — a
      // fresh generation means a late-resolving failed attempt can never
      // clobber this one.
      pendingTurnIdRef.current = null;
      isSubmittingRef.current = false;
      const myGeneration = (runGenerationRef.current += 1);
      dispatch({ type: "START_REQUEST" });
      try {
        const response = await deps.startDialogue(args);
        if (cancelledRef.current || myGeneration !== runGenerationRef.current) return;
        dispatch({ type: "START_SUCCESS", response });
        startTick();
      } catch (e) {
        if (cancelledRef.current || myGeneration !== runGenerationRef.current) return;
        const message = e instanceof Error ? e.message : "start_failed";
        stopTick();
        dispatch({ type: "ERROR", message });
      }
    },
    [deps, startTick, stopTick]
  );

  const submitStudentTurn = useCallback(
    async (args: { fileUri: string; userId: string; voice?: string }) => {
      const sessionId = state.sessionId;
      if (!sessionId) {
        dispatch({ type: "ERROR", message: "no_active_session" });
        return;
      }
      // Re-entrancy guard: a second overlapping submit before the first
      // TURN_SUCCESS would read the same turnCount → same storage path
      // (`upsert:true` clobbers) and reuse the same clientTurnId for a
      // different audio file. Short-circuit it.
      if (isSubmittingRef.current) return;
      // Mint once; reuse across retries so the backend dedups the turn
      // (P20 — kept on error, cleared only on success below).
      if (pendingTurnIdRef.current === null) {
        pendingTurnIdRef.current = newIdempotencyKey();
      }
      const clientTurnId = pendingTurnIdRef.current;
      const myGeneration = runGenerationRef.current;

      isSubmittingRef.current = true;
      // RECORDING_STARTED → UPLOAD_STARTED fire synchronously: `recording` is
      // a pass-through transient here — the screen owns the real recording
      // lifecycle, so the machine never visibly rests in `recording`.
      dispatch({ type: "RECORDING_STARTED" });
      dispatch({ type: "UPLOAD_STARTED" });
      try {
        const entry = deps.getRecordingBlob(args.fileUri);
        if (!entry) {
          throw new Error("recording_not_found");
        }
        const turnIndex = state.turnCount;
        const { signedUploadUrl, storagePath } = await deps.reserveStudentTurnUpload({
          userId: args.userId,
          sessionId,
          turnIndex,
        });
        await deps.putStudentAudio(signedUploadUrl, entry.blob, entry.mimeType);
        const response = await deps.sendDialogueTurn({
          sessionId,
          audioPath: storagePath,
          clientTurnId,
          voice: args.voice,
        });
        if (cancelledRef.current || myGeneration !== runGenerationRef.current) return;
        dispatch({ type: "TURN_SUCCESS", response });
        // Success: clear so the NEXT turn gets a fresh id.
        pendingTurnIdRef.current = null;
      } catch (e) {
        if (cancelledRef.current || myGeneration !== runGenerationRef.current) return;
        const message = e instanceof Error ? e.message : "turn_failed";
        // Keep the pending id on error so a retry replays the same turn
        // (P20 — the whole point of the ref).
        stopTick();
        dispatch({ type: "ERROR", message });
      } finally {
        // Clear only the in-flight flag — never the pending id (the
        // keep-on-error / clear-on-success semantics live above).
        isSubmittingRef.current = false;
      }
    },
    [deps, state.sessionId, state.turnCount, stopTick]
  );

  const finalize = useCallback(async () => {
    const sessionId = state.sessionId;
    if (!sessionId) {
      dispatch({ type: "ERROR", message: "no_active_session" });
      return;
    }
    // Web delta: mobile's hook has no guard here — `finalizeDialogue` is
    // NOT idempotent server-side (unlike `sprechen-finalize`'s `replay`
    // flag; see `../resultStore.ts`), so a second call once already
    // `graded` (or a second overlapping call while `finalizing`) would hit
    // the server against an already-closed session. Block it client-side.
    if (state.phase === "graded" || state.phase === "finalizing") return;
    stopTick();
    const myGeneration = runGenerationRef.current;
    dispatch({ type: "FINALIZE_REQUEST" });
    try {
      const response = await deps.finalizeDialogue(sessionId);
      if (cancelledRef.current || myGeneration !== runGenerationRef.current) return;
      dispatch({ type: "FINALIZE_SUCCESS", response });
      // Stash the graded result so a later screen can read it without a
      // second, non-idempotent finalize call (Constraint 1).
      useDialogueResult.getState().setResult(response);
    } catch (e) {
      if (cancelledRef.current || myGeneration !== runGenerationRef.current) return;
      const message = e instanceof Error ? e.message : "finalize_failed";
      stopTick();
      dispatch({ type: "ERROR", message });
    }
  }, [deps, state.sessionId, state.phase, stopTick]);

  const markPartnerAudioConsumed = useCallback(() => {
    dispatch({ type: "PARTNER_AUDIO_CONSUMED" });
  }, []);

  const reset = useCallback(() => {
    stopTick();
    // Supersede any in-flight run so its late result is dropped, and clear
    // the per-turn id so the next session's first turn mints a fresh one.
    runGenerationRef.current += 1;
    pendingTurnIdRef.current = null;
    isSubmittingRef.current = false;
    dispatch({ type: "RESET" });
  }, [stopTick]);

  return {
    ...state,
    start,
    submitStudentTurn,
    finalize,
    markPartnerAudioConsumed,
    reset,
  };
}
