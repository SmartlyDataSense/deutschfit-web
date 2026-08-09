"use client";

/**
 * `DialogueSessionScreen` — live paired-Sprechen ("dialogue") turn loop
 * (S7 · Task 7.11). Web port of `deutschfit-mobile/src/features/sprechen/
 * dialogue/screens/DialogueSessionScreen.tsx` (478L) — read fully before
 * touching this file.
 *
 * Lifecycle (mobile-verbatim):
 *   - Boot once: resolve the authenticated user id, then `session.start(...)`.
 *   - Auto-play each new partner turn via `useAudioReplay`.
 *   - Record button toggles recording; on stop, submits via the F-028
 *     stop-return contract (use the value RETURNED by `await recorder.stop()`,
 *     never `recorder.uri` in the same tick).
 *   - Auto-finalize when `mustFinalize && phase === "awaiting_student"`.
 *   - On `phase === "graded"`, stash the result + route to the feedback
 *     route exactly once.
 *
 * Web delta — no `onGraded` callback / no React Navigation wrapper: mobile
 * receives `board`/`level`/`onGraded` as props from its navigator, which
 * itself calls `resultStore.setResult` + navigates. This app has no
 * navigator layer, so the graded effect below does both directly — reads
 * `session.grader`, calls `useDialogueResult.getState().setResult(...)`,
 * then `router.replace(...)` to the feedback route. (`useDialogueSession`'s
 * own `finalize()` already seeds the same store as a Constraint-1
 * belt-and-suspenders — this call is idempotent against that: both write
 * the identical `DialogueResult` object.)
 *
 * Web delta — `board`/`level` re-derived from the exam-context store
 * instead of route/nav params: mobile's navigator resolves these before
 * this screen ever mounts. Web's picker route carries only `teil`+`themeId`
 * in the query string (board/level aren't re-selectable mid-flow), so the
 * boot effect (and the retry handler) reads `useExamContextStore.getState()`
 * fresh each time — by the time a learner reaches this route the picker
 * screen has already hydrated the store, so this is a safe read, not a
 * race. Web delta — level casing: the store's `level` is lower-case
 * (`"b1"`); every dialogue wire call needs upper-case (`"B1"` — see
 * `DialogueTeilPickerScreen`'s file doc comment for the DB check-constraint
 * citation), so both call sites upper-case it.
 *
 * Web delta — auto-scroll: mobile scrolls its `ScrollView` to the newest
 * turn on every history append. This screen renders in the page's normal
 * document flow (no fixed-height scroll container to manage) — dropped,
 * not ported. No web equivalent, not named in the task brief's interface
 * spec.
 *
 * Constraint 15 (binding): feature code imports wire fns/types ONLY from
 * `@/learner/core/api/examApi`.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useTranslation } from "react-i18next";

import { AppButton, AppText, Card } from "@/learner/ui/primitives";

import { useLearnerSession } from "@/learner/core/auth/useLearnerSession";
import { useExamContextStore } from "@/learner/core/exam/examContext";

import { useAudioReplay, type NativePlayer } from "../../hooks/useAudioReplay";
import { useRecorder, type NativeRecorder } from "../../hooks/useRecorder";
import {
  useDialogueSession,
  type DialogueDeps,
  type DialoguePhase,
} from "../hooks/useDialogueSession";
import { useDialogueResult } from "../resultStore";

// ---------------------------------------------------------------------------
// Known error keys the hook can dispatch as `errorMessage`. Enumerated from
// the reducer ERROR actions + default fallback strings (mobile-verbatim).
// ---------------------------------------------------------------------------

const KNOWN_ERROR_KEYS = new Set<string>([
  "start_failed",
  "turn_failed",
  "finalize_failed",
  "no_active_session",
  "permission_denied",
  "recorder_unavailable",
  // Edge-fn 502 when the partner opening-turn LLM misses its 20s budget —
  // transient; a single retry usually clears it.
  "partner_timeout_20s",
]);

/** Map a hook `errorMessage` onto its translated copy key. */
function errorCopyKey(message: string): string {
  return KNOWN_ERROR_KEYS.has(message)
    ? `dialogueSession.error.${message}`
    : "dialogueSession.error.generic";
}

function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m.toString().padStart(2, "0")}:${r.toString().padStart(2, "0")}`;
}

// Phases during which the record toggle must be disabled — mobile-verbatim
// set (`failed` included deliberately: no in-screen retry for a turn
// failure, only for the boot failure below; `graded` is transient, the
// screen routes away as soon as the graded effect fires).
const BUSY_PHASES: ReadonlySet<DialoguePhase> = new Set([
  "starting",
  "uploading",
  "partner_responding",
  "finalizing",
  "graded",
  "failed",
]);

export interface DialogueSessionScreenProps {
  readonly teil: string;
  readonly themeId?: string;
  /** Test seam — injectable `useDialogueSession` deps. */
  readonly sessionDeps?: Partial<DialogueDeps>;
  /** Test seam — injectable `useRecorder` native factory. */
  readonly recorderFactory?: () => NativeRecorder | null;
  /** Test seam — injectable `useAudioReplay` native factory. */
  readonly replayFactory?: () => NativePlayer | null;
}

export function DialogueSessionScreen({
  teil,
  themeId,
  sessionDeps,
  recorderFactory,
  replayFactory,
}: DialogueSessionScreenProps) {
  const router = useRouter();
  const locale = useLocale();
  const { t } = useTranslation("sprechen");

  const session = useDialogueSession(sessionDeps);
  const recorder = useRecorder(recorderFactory);
  const replay = useAudioReplay(replayFactory);

  const [userId, setUserId] = useState<string | null>(null);

  // Ref guards — prevent effects from firing more than once per lifecycle
  // (mobile-verbatim rationale, see each effect below).
  const bootedRef = useRef(false);
  const notifiedRef = useRef(false);
  const mustFinalizeRef = useRef(false);
  // Last partner-audio URL we played — guards against React StrictMode's
  // double effect-invoke replaying the same clip twice.
  const lastPlayedUrlRef = useRef<string | null>(null);

  // Reads a fresh board/level from the exam-context store and starts (or
  // restarts) the session — shared by the boot effect and the boot-failure
  // retry handler so both upper-case the level the same way.
  const startSession = useCallback(() => {
    const ctx = useExamContextStore.getState();
    void session.start({ board: ctx.board, level: ctx.level.toUpperCase(), teil, themeId });
    // Deliberately depending on `session.start` (a stable useCallback from
    // the hook) rather than the whole `session` object — the latter churns
    // every render (fresh `{...state, start, ...}` object), which would
    // invalidate this callback (and re-run the boot effect below) on every
    // phase transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.start, teil, themeId]);

  // -------------------------------------------------------------------------
  // Boot: resolve userId + start session — runs exactly once on mount.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    setUserId(useLearnerSession.getState().session?.user.id ?? null);
    startSession();
    // Intentionally excluding startSession/teil/themeId from deps: these
    // are mount-time params; the session must boot exactly once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------------------------------------------------------------------
  // Partner audio auto-play. The `!url` guard also covers the M-2
  // idempotent-replay case (`partnerAudioUrl === null`) — no separate
  // branch needed, the screen already no-ops and skips auto-play for it.
  // -------------------------------------------------------------------------
  useEffect(() => {
    const url = session.partnerAudioUrl;
    if (!url || lastPlayedUrlRef.current === url) return;
    lastPlayedUrlRef.current = url;
    try {
      replay.load(url);
      replay.play();
    } catch {
      // player_unavailable — partner text still shows via history.
    }
    // Mark consumed so the hook clears the URL and doesn't re-emit it.
    session.markPartnerAudioConsumed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.partnerAudioUrl]);

  // -------------------------------------------------------------------------
  // Graded — seed the result store + route to the feedback route exactly
  // once (Web delta: no `onGraded` prop, see file doc comment).
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (session.phase === "graded" && session.grader !== null && !notifiedRef.current) {
      notifiedRef.current = true;
      useDialogueResult.getState().setResult(session.grader);
      router.replace(`/${locale}/app/sprechen/dialogue/feedback`);
    }
  }, [session.phase, session.grader, router, locale]);

  // -------------------------------------------------------------------------
  // Auto-finalize on mustFinalize.
  //
  // `mustFinalize` latches true for the rest of the session (the reducer
  // never clears it), so a one-shot ref guard is all we need — there is no
  // reset branch because the flag never falls back to false.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (session.mustFinalize && session.phase === "awaiting_student" && !mustFinalizeRef.current) {
      mustFinalizeRef.current = true;
      void session.finalize();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.mustFinalize, session.phase]);

  // -------------------------------------------------------------------------
  // Record toggle — F-028: use returned value from stop(), not recorder.uri.
  // -------------------------------------------------------------------------
  const handleToggleRecord = useCallback(() => {
    void (async () => {
      if (recorder.status === "recording") {
        const { uri } = await recorder.stop();
        if (uri.length > 0 && userId !== null) {
          await session.submitStudentTurn({ fileUri: uri, userId });
        }
      } else {
        if (recorder.permission !== "granted") {
          await recorder.requestPermission();
        }
        await recorder.start();
      }
    })();
  }, [recorder, userId, session]);

  const handleRetryStart = useCallback(() => {
    startSession();
  }, [startSession]);

  // -------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------
  const isRecordDisabled = BUSY_PHASES.has(session.phase);

  // Boot failure — the session never started (transient partner_timeout_20s
  // 502s land here). Renders a full error state with an in-screen retry;
  // retry re-runs `start`, which resets the hook to a clean state and mints
  // a new generation.
  const isBootFailure = session.phase === "failed" && session.sessionId === null;

  const statusKey = ((): string | null => {
    switch (session.phase) {
      case "starting":
        return "dialogueSession.status.starting";
      case "uploading":
        return "dialogueSession.status.uploading";
      case "partner_responding":
        return "dialogueSession.status.partnerResponding";
      case "finalizing":
        return "dialogueSession.status.finalizing";
      case "graded":
        return "dialogueSession.status.graded";
      default:
        return null;
    }
  })();

  return (
    <div
      data-testid="dialogue-session-screen"
      className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6 lg:px-8"
    >
      {session.config !== null ? (
        <Card padded className="flex flex-col gap-1">
          <AppText family="serif" size="h3" weight="semi" tone="primary">
            {session.config.taskNativeLabel}
          </AppText>
          <AppText family="sans" size="body" tone="secondary">
            {session.config.taskInstructionsDe}
          </AppText>
        </Card>
      ) : null}

      <AppText
        family="sans"
        size="caption"
        tone="secondary"
        testID="dialogue-session-timer"
        align="right"
        numeric
      >
        {t("dialogueSession.timeRemaining", {
          time: formatClock(session.timeRemainingSec),
        })}
      </AppText>

      <div className="flex flex-col gap-2">
        {session.history.map((turn) => (
          <div
            key={turn.index}
            data-testid={`dialogue-session-turn-${turn.index}`}
            className={
              turn.speaker === "student"
                ? "max-w-[85%] self-end rounded-[var(--radius-md)] border border-line-soft bg-bg-card p-3"
                : "max-w-[85%] self-start rounded-[var(--radius-md)] border border-line-soft bg-bg-subtle p-3"
            }
          >
            <AppText
              family="sans"
              size="caption"
              tone="tertiary"
              className="tracking-wide uppercase"
            >
              {t(
                turn.speaker === "student"
                  ? "dialogueSession.speaker.student"
                  : "dialogueSession.speaker.partner"
              )}
            </AppText>
            <AppText family="sans" size="body" tone="primary">
              {turn.text}
            </AppText>
          </div>
        ))}
      </div>

      {statusKey !== null ? (
        <AppText
          family="sans"
          size="caption"
          tone="secondary"
          testID="dialogue-session-status"
          align="center"
          className="italic"
        >
          {t(statusKey)}
        </AppText>
      ) : null}

      {isBootFailure ? (
        <div
          data-testid="dialogue-session-start-error"
          className="flex flex-col items-center gap-3 py-8 text-center"
        >
          <AppText family="serif" size="h3" weight="semi" align="center">
            {t("dialogueSession.startError.title")}
          </AppText>
          {session.errorMessage !== null ? (
            <AppText tone="secondary" size="body" align="center">
              {t(errorCopyKey(session.errorMessage))}
            </AppText>
          ) : null}
          <AppButton
            testID="dialogue-session-start-error-retry"
            label={t("dialogueSession.startError.retry")}
            onClick={handleRetryStart}
            variant="outline"
          />
        </div>
      ) : null}

      {session.errorMessage !== null && !isBootFailure ? (
        <div
          data-testid="dialogue-session-error"
          className="rounded-[var(--radius-sm)] bg-error-subtle p-3"
        >
          <AppText tone="warning" size="small">
            {t(errorCopyKey(session.errorMessage))}
          </AppText>
        </div>
      ) : null}

      <div className="mt-2 flex flex-col gap-3 border-t border-line-subtle pt-4 sm:flex-row">
        <AppButton
          testID="dialogue-session-record-toggle"
          label={t(
            recorder.status === "recording"
              ? "dialogueSession.record.stop"
              : "dialogueSession.record.start"
          )}
          onClick={handleToggleRecord}
          disabled={isRecordDisabled}
          className="flex-1"
        />
        <AppButton
          testID="dialogue-session-finish"
          label={t("dialogueSession.finish")}
          disabled={!session.canFinalize}
          onClick={() => {
            void session.finalize();
          }}
          variant="outline"
          className="flex-1"
        />
      </div>
    </div>
  );
}
