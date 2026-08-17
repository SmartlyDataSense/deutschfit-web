"use client";

/**
 * `SprechenSessionScreen` — the Sprechen monologue leaf (S7 Task 7.8).
 *
 * Web port of `deutschfit-mobile/src/features/sprechen/screens/
 * SprechenSessionScreen.tsx` (1554L — read fully before touching this
 * file). One screen owns the full per-attempt UX: prep (advice + optional
 * mic check + Gliederung) → record → review → submit → awaiting → done /
 * fallback.
 *
 * Deliberate P1 omission (do NOT port): mobile's `source` prop union
 * (`'apprendre' | 'coach' | 'modelltests-single' | 'mock-leg'`) and the
 * `onResolve` callback exist only for the orchestrator-driven mock-exam
 * leg. Web hardcodes `source: "apprendre"` at every analytics call site —
 * there is no mock-leg / orchestrator concept here, and no `onResolve`
 * caller. Deferred to S8 if/when a mock-exam Sprechen leg ships on web.
 *
 * Route split (S6 dynamic-segment template, `schreiben/feedback/
 * [submissionId]/page.tsx`): `topicId` is a PROP, read via `useParams()`
 * in the page component, not here — keeps this screen testable without
 * mocking `next/navigation`'s `useParams`.
 *
 * P18 — topic resolution: the handoff store (`useTopicHandoff`, written by
 * `TopicPickerScreen`/`CustomTopicScreen` immediately before they push this
 * route) is checked first, matched against `topicId` to guard against a
 * stale cross-topic handoff. On a miss (deep-link / hard refresh / a topic
 * from a different browsing session) we refetch `topics-list` unfiltered
 * and find the row by id — never resurrect a stale handoff. Still missing
 * → a genuinely web-only error state (mobile always receives a full
 * route-param envelope, never just an id) with a back-to-catalogue CTA.
 *
 * Web delta — prompt synthesis: mobile's `PrepView`/`RecordView` render a
 * fixture-sourced `eyebrow`/`consigneLabel`/`promptGerman`/`promptFrench`
 * quartet (`__fixtures__/dummyPrompts.ts`, synthetic scaffold copy pending
 * curated data per issue #484). `TopicCard` has no equivalent fields, so
 * this screen renders the topic's own `titleDe`/`subtitleFr` directly
 * instead of inventing fixture-shaped chrome — a simplification, not a
 * missing interface. `durationSeconds` (used for both the auto-stop cap
 * AND the length-warning target) is `getMonologueTargetSec(subgenre,
 * level)` per the task brief — on web the two mobile-distinct inputs
 * (`prompt.durationSeconds` from the fixture vs. `pickerSubgenre`/
 * `pickerLevel` for the length-warning target) collapse into one
 * `targetSec` value, since a resolved topic carries exactly one
 * (subgenre, level) pair (no separate "picker state").
 *
 * Web delta — `teil`: mobile derives `teil` from route params (B1→2,
 * B2→1 dual mapping via legacy Prep). `TopicCard` carries no `teil` field
 * and `finalize()`'s wire payload doesn't accept one (only `reserveUpload`
 * does, as an upload-registry label) — every web session pins
 * `CANONICAL_TEIL = 2` per the task brief's literal "teil 2 canonical".
 *
 * Web delta — dropped chrome (no web equivalent, not named in the task
 * brief's interface spec): `StepTabHeader` (3-tab progress header),
 * `AlignmentBadge` (+ its `RUBRIC_ALIGNMENT` map), `PassStatusPill`,
 * `DisclaimerBanner`, `LiveTranscriptCard` (replaced by a static empty
 * transcript card — anti-requirement 3: no live transcription on web).
 *
 * Web delta — toast → inline banner / readiness (P10, F-043 parity):
 *   - Success (`awaiting`): no toast. `markSubmissionInFlight` seeds the
 *     S3 readiness slot, then `router.replace(/{locale}/app)` — same
 *     "optimistic dismiss, no blocking popup" UX, routed through the
 *     shared readiness machine instead of a toast (SchreibenEditorScreen
 *     P5 precedent).
 *   - Failure (`fallback` / errored `done`): mobile fires a toast AND
 *     bounces to Accueil for every non-`rejected` terminal. Web has no
 *     toast, so it does NOT bounce for the generic case — the inline
 *     `sprechen-session-fallback-banner` (already part of `FeedbackView`,
 *     ported verbatim) stays on screen so the learner can actually read
 *     it. `rejected` still redirects to the feedback route (F-043
 *     parity) so the learner sees the verdict card.
 *
 * Web delta — mic-check bootstrap: mobile hydrates `useMicCheckFlagStore`
 * once from the app-level bootstrap composition (`App.tsx`). Web has no
 * such composition yet for this flag (confirmed: `bootstrapMicCheckFlag`
 * has no non-test caller anywhere in the app) — this screen is the flag's
 * only consumer, so it self-hydrates on mount, same idiom as the
 * exam-context self-hydration established by `TopicPickerScreen`/
 * `SchreibenEditorScreen`.
 *
 * Constraint 15 (binding): feature code imports wire fns/types ONLY from
 * `@/learner/core/api/examApi`.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useTranslation } from "react-i18next";

import { AppButton, AppText, EmptyState, Skeleton, Waveform } from "@/learner/ui/primitives";

import {
  fetchTopics,
  type OutlineStep,
  type SprechenSubgenre,
  type SprechenSubmission,
  type TopicCard,
} from "@/learner/core/api/examApi";
import { hydrateExamContext, useExamContextStore } from "@/learner/core/exam/examContext";
import { CERT_CODES_BY_BOARD } from "@/learner/core/exam/examTypes";
import { trackEvent } from "@/learner/core/analytics/posthog";
import { acknowledgeReadiness, markSubmissionInFlight } from "@/learner/core/readiness";
import {
  ModuleResultLayout,
  dimensionScoresFromWire,
} from "@/learner/ui/blocks/ModuleResultLayout";

import { releaseRecording } from "../audio/webRecorder";
import { LocalAudioPlayer } from "../components/LocalAudioPlayer";
import {
  MIC_CHECK_DURATION_MS,
  useMicCheck,
  type MicCheckErrorCode,
  type NativeMicCheck,
} from "../hooks/useMicCheck";
import { bootstrapMicCheckFlag, useMicCheckFlag } from "../hooks/useMicCheckFlag";
import { useRecorder, type NativeRecorder } from "../hooks/useRecorder";
import {
  useSprechenSession,
  type MonologueSubgenre,
  type SprechenSessionDeps,
} from "../hooks/useSprechenSession";
import { SHORT_RECORDING_RATIO, getMonologueTargetSec } from "../services/levelThresholds";
import { useTopicHandoff } from "../topicHandoffStore";

/** Every web Sprechen session is graded as Teil 2 — see module doc comment. */
const CANONICAL_TEIL = 2;

const MIC_CHECK_DURATION_S = Math.round(MIC_CHECK_DURATION_MS / 1000);

function toMonologueSubgenre(subgenre: SprechenSubgenre): MonologueSubgenre {
  return subgenre === "vortrag" ? "vortrag" : "praesentation";
}

function formatClock(ms: number): string {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

export interface SprechenSessionScreenProps {
  readonly topicId: string;
  /** Test seam — injectable `useSprechenSession` deps (reserve/put/finalize/poller). */
  readonly sessionDeps?: SprechenSessionDeps;
  /** Test seam — injectable `useRecorder` native factory. */
  readonly recorderFactory?: () => NativeRecorder | null;
  /** Test seam — injectable `useMicCheck` native factory. */
  readonly micCheckNativeFactory?: () => NativeMicCheck | null;
}

export function SprechenSessionScreen({
  topicId,
  sessionDeps,
  recorderFactory,
  micCheckNativeFactory,
}: SprechenSessionScreenProps) {
  const router = useRouter();
  const locale = useLocale();
  const { t } = useTranslation(["sprechen"]);

  const board = useExamContextStore((s) => s.board);
  const level = useExamContextStore((s) => s.level);

  useEffect(() => {
    void hydrateExamContext();
    void bootstrapMicCheckFlag();
  }, []);

  /* ------------------------- P18 topic resolution ------------------------ */

  const [topic, setTopic] = useState<TopicCard | null>(() => {
    const handoff = useTopicHandoff.getState().topic;
    return handoff && handoff.id === topicId ? handoff : null;
  });
  const [topicStatus, setTopicStatus] = useState<"loading" | "found" | "not-found">(
    topic ? "found" : "loading"
  );

  useEffect(() => {
    if (topic) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchTopics({});
        if (cancelled) return;
        const found = rows.find((row) => row.id === topicId) ?? null;
        if (found) {
          setTopic(found);
          setTopicStatus("found");
        } else {
          setTopicStatus("not-found");
        }
      } catch {
        if (!cancelled) setTopicStatus("not-found");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot resolution keyed on topicId only.
  }, [topicId]);

  /* ------------------------- prompt derivation ---------------------------- */

  const sessionSubgenre: MonologueSubgenre = topic
    ? toMonologueSubgenre(topic.subgenre)
    : "praesentation";
  const sessionLevel = topic?.level ?? "B1";
  const outlineSteps: readonly OutlineStep[] = topic?.outlineSteps ?? [];
  const targetSec = getMonologueTargetSec(sessionSubgenre, sessionLevel);
  const cap = targetSec * 1000;
  const examSlug = `${board}-${level}`;
  // The topic's own cert (if the resolved TopicCard carries one) is the
  // authoritative code for grading — it names the catalog row actually
  // being attempted, which can diverge from the learner's own exam board
  // (e.g. browsing "All topics"). Falls back to the board's primary cert
  // (mirrors `TopicPickerScreen`'s `pickPrimaryCertCode`) when the topic
  // carries none.
  const sessionCert = topic?.cert ?? (CERT_CODES_BY_BOARD[board][0] as string | undefined);

  const session = useSprechenSession({
    examSlug,
    teil: CANONICAL_TEIL,
    topicId,
    subgenre: sessionSubgenre,
    cert: sessionCert,
    level: sessionLevel,
    deps: sessionDeps,
  });

  const recorder = useRecorder(recorderFactory);

  /* ------------------------------ mic check -------------------------------- */

  const {
    passed: micCheckPassed,
    hydrated: micCheckHydrated,
    markPassed: markMicCheckPassed,
  } = useMicCheckFlag();
  const [micCheckSkipped, setMicCheckSkipped] = useState(false);
  const micCheck = useMicCheck({
    nativeFactory: micCheckNativeFactory,
    onPassed: () => {
      void markMicCheckPassed();
    },
  });
  const showMicCheck = micCheckHydrated && !micCheckPassed && !micCheckSkipped;
  const recorderReady = !showMicCheck || micCheck.status === "done";

  /* --------------------------- sprechen_session_start ---------------------- */

  // Web delta: mobile fires this on the "démarrer" click (`handleStart`);
  // the task brief pins it to a one-shot mount effect instead.
  const startFiredRef = useRef(false);
  useEffect(() => {
    if (startFiredRef.current) return;
    startFiredRef.current = true;
    trackEvent("sprechen_session_start", {
      teil: CANONICAL_TEIL,
      board,
      level,
      source: "apprendre",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot on mount, board/level captured at first render.
  }, []);

  /* ------------------------------- recorder boot ---------------------------- */

  const recorderBootRef = useRef(false);
  // #380 — guards the single auto-stop fire once the recording reaches `cap`.
  const autoStopFiredRef = useRef(false);
  useEffect(() => {
    if (session.phase !== "record" || recorderBootRef.current) return;
    recorderBootRef.current = true;
    autoStopFiredRef.current = false;
    void (async () => {
      await recorder.requestPermission();
      await recorder.start();
    })();
  }, [recorder, session.phase]);

  /* ------------------------------- handlers --------------------------------- */

  const handleStart = useCallback((): void => {
    if (!recorderReady) return;
    session.startRecording();
  }, [recorderReady, session]);

  const handleMicCheckStart = useCallback((): void => {
    void micCheck.start();
  }, [micCheck]);

  const handleMicCheckSkip = useCallback((): void => {
    setMicCheckSkipped(true);
  }, []);

  const reviewActualSec = Math.floor(session.durationMs / 1000);
  const isShortRecording =
    session.durationMs > 0 && reviewActualSec < SHORT_RECORDING_RATIO * targetSec;

  // #373 / F-028 — `record` → `review`. `recorder.stop()`'s RETURNED value
  // is threaded straight into `reviewRecording`; `recorder.uri` read in the
  // same tick would still be the pre-stop `null` (React state from
  // `STOP_SUCCESS` isn't visible until the next render).
  // Fix-round delta: `recorder` and `session` are freshly-constructed
  // objects every render (`useRecorder`/`useSprechenSession` both return
  // `{...state, ...methods}` literals), so depending on the whole object
  // churns `handleStop`'s identity on every unrelated re-render — not just
  // when something it actually reads changes. Narrowed to the specific
  // primitives + the two methods, both of which ARE referentially stable
  // across renders (`recorder.stop` deps on `[dispatch, native, stopTick]`,
  // all stable; `session.reviewRecording` deps on `[teil, topicId]`, both
  // fixed for the session's lifetime) — so `handleStop`'s identity now only
  // changes when one of these primitives actually changes, matching the
  // auto-stop effect's own dependency intent below.
  const handleStop = useCallback((): void => {
    // Destructured to plain locals so the calls below (`stop()` /
    // `reviewRecording(...)`) are identifier calls, not `recorder.stop()` /
    // `session.reviewRecording(...)` member-expression calls — the latter
    // trips eslint-plugin-react-hooks' conservative "implicit `this`" rule,
    // which then demands the *whole* `recorder`/`session` object in the
    // deps array and would reintroduce the every-render identity churn
    // this fix is removing.
    const recorderStatus = recorder.status;
    const recorderUri = recorder.uri;
    const recorderDurationMs = recorder.durationMs;
    const stop = recorder.stop;
    const reviewRecording = session.reviewRecording;
    void (async () => {
      const result =
        recorderStatus === "recording"
          ? await stop()
          : { uri: recorderUri ?? "", durationMs: recorderDurationMs };
      const actualSec = Math.floor(result.durationMs / 1000);
      if (actualSec < SHORT_RECORDING_RATIO * targetSec) {
        trackEvent("length_warning_shown", {
          subgenre: sessionSubgenre,
          level: sessionLevel,
          actual_sec: actualSec,
          target_sec: targetSec,
        });
      }
      reviewRecording({
        recordingUri: result.uri || null,
        durationMs: result.durationMs,
      });
    })();
  }, [
    recorder.durationMs,
    recorder.status,
    recorder.stop,
    recorder.uri,
    session.reviewRecording,
    sessionLevel,
    sessionSubgenre,
    targetSec,
  ]);

  // #380 — auto-stop once the recording reaches `cap`. Single fire per
  // recording via `autoStopFiredRef`.
  useEffect(() => {
    if (session.phase !== "record") return;
    if (recorder.status !== "recording") return;
    if (recorder.durationMs < cap) return;
    if (autoStopFiredRef.current) return;
    autoStopFiredRef.current = true;
    handleStop();
  }, [cap, handleStop, recorder.durationMs, recorder.status, session.phase]);

  const handleReviewRetake = useCallback((): void => {
    if (isShortRecording) {
      trackEvent("length_warning_retry", {
        subgenre: sessionSubgenre,
        level: sessionLevel,
        actual_sec: reviewActualSec,
        target_sec: targetSec,
      });
    }
    // Blob-registry contract (F2): the review clip is being discarded — the
    // learner is re-recording, `LocalAudioPlayer` above is about to unmount,
    // and nothing else will ever read this uri again. Release it BEFORE
    // `session.reset()` clears `recordingUri` so `webRecorder.ts`'s
    // module-level registry doesn't retain the Blob + its object URL for
    // the rest of the SPA session. The FRESH recording that follows gets
    // its own new uri and is left untouched here.
    if (session.recordingUri) {
      releaseRecording(session.recordingUri);
    }
    recorder.reset();
    recorderBootRef.current = false;
    session.reset();
  }, [
    isShortRecording,
    recorder,
    reviewActualSec,
    session,
    sessionLevel,
    sessionSubgenre,
    targetSec,
  ]);

  const handleReviewSubmit = useCallback((): void => {
    if (isShortRecording) {
      trackEvent("length_warning_dismissed", {
        subgenre: sessionSubgenre,
        level: sessionLevel,
        actual_sec: reviewActualSec,
        target_sec: targetSec,
      });
    }
    trackEvent("sprechen_recorded", {
      prompt_id: topicId,
      teil: CANONICAL_TEIL,
      duration_ms: session.durationMs,
    });
    session.submitRecording({
      recordingUri: session.recordingUri,
      durationMs: session.durationMs,
    });
  }, [
    isShortRecording,
    reviewActualSec,
    session,
    sessionLevel,
    sessionSubgenre,
    targetSec,
    topicId,
  ]);

  /**
   * #54 — retry after a failed send. Re-runs the WHOLE upload sequence
   * (reserve -> PUT -> finalize) from the retained `recordingUri`/
   * `durationMs`, exactly like a first attempt — `submitRecording` never
   * resurrects the abandoned `submissionId` (the hook already reset it to
   * `null`; that reservation is dead). Only wired up when
   * `session.recordingUri` is still non-null, i.e. only for the specific
   * failure the hook's F2 contract guarantees retains the blob: reserve/
   * PUT/finalize threw before a submission ever existed server-side.
   */
  const handleRetry = useCallback((): void => {
    if (!session.recordingUri) return;
    session.submitRecording({
      recordingUri: session.recordingUri,
      durationMs: session.durationMs,
    });
  }, [session]);

  const handleAcknowledgeResult = useCallback((): void => {
    session.acknowledgeResult();
    router.push(`/${locale}/app`);
  }, [locale, router, session]);

  const handleReset = useCallback((): void => {
    session.reset();
    recorder.reset();
    recorderBootRef.current = false;
    dismissedAttemptRef.current = null;
    errorAttemptRef.current = null;
  }, [recorder, session]);

  const handleGoHome = useCallback((): void => {
    router.push(`/${locale}/app`);
  }, [locale, router]);

  const handleViewFullFeedback = useCallback((): void => {
    const id = session.submissionId;
    if (id === null) return;
    router.push(`/${locale}/app/sprechen/feedback/${id}`);
  }, [locale, router, session.submissionId]);

  /* ---------------------------- P10 optimistic dismiss ----------------------- */

  const dismissedAttemptRef = useRef<string | null>(null);
  useEffect(() => {
    if (session.phase !== "awaiting") return;
    const id = session.submissionId;
    const attemptKey = id ?? "pending";
    if (dismissedAttemptRef.current === attemptKey) return;
    dismissedAttemptRef.current = attemptKey;

    trackEvent("sprechen_session_resolve", {
      teil: CANONICAL_TEIL,
      source: "apprendre",
      action: "submitted-optimistic",
      had_submission: id !== null,
    });

    if (id !== null) {
      markSubmissionInFlight(id, "sprechen");
    }

    // Web delta (P10): no toast — bounce straight to Accueil, same
    // "optimistic dismiss" contract as `SchreibenEditorScreen` (P5).
    router.replace(`/${locale}/app`);
  }, [locale, router, session.phase, session.submissionId]);

  /* ----------------------------- error terminals ------------------------------ */

  const errorAttemptRef = useRef<string | null>(null);
  useEffect(() => {
    // `useSprechenSession` only ever reaches `done` from a `graded` poll
    // snapshot (see the hook's `enterAwaiting` closure) — every failure
    // path (`failed`/`error`/`rejected`/`timeout`/no-recording) lands in
    // `fallback` instead, so `fallback` is the sole error terminal here.
    if (session.phase !== "fallback") return;

    const id = session.submissionId;
    const attemptKey = id ?? "pending";
    if (errorAttemptRef.current === attemptKey) return;
    errorAttemptRef.current = attemptKey;

    const errorCode = session.error ?? session.submission?.error_message ?? null;
    trackEvent("sprechen_session_resolve", {
      teil: CANONICAL_TEIL,
      source: "apprendre",
      action: "failed-optimistic",
      had_submission: id !== null,
      error_code: errorCode ?? "unknown",
    });

    // F-043 — a deterministic backend rejection routes to the feedback
    // route so the learner sees the verdict card + retry CTA. Every other
    // error terminal (Web delta) stays on this screen so the inline
    // fallback banner in `FeedbackView` is actually visible — mobile
    // bounces to Accueil after its toast; web has no toast to read first.
    const isRejectedSubmission = id !== null && session.submission?.status === "rejected";
    if (isRejectedSubmission) {
      router.replace(`/${locale}/app/sprechen/feedback/${id}`);
    }
  }, [locale, router, session.error, session.phase, session.submission, session.submissionId]);

  // Reset both guards when a fresh attempt starts — including a #54 retry,
  // which re-enters `submit` directly from `fallback` without passing
  // through `prep`/`record` first, and must be able to re-fire the
  // failed-optimistic analytics event if it fails again.
  useEffect(() => {
    if (session.phase === "prep" || session.phase === "record" || session.phase === "submit") {
      dismissedAttemptRef.current = null;
      errorAttemptRef.current = null;
    }
  }, [session.phase]);

  // Replay-safe path: if grading lands while this screen is still mounted
  // (a race against the P10 `router.replace` above), terminate the S3
  // readiness lifecycle once the learner has actually seen the result —
  // same `acknowledgeReadiness` contract as `FeedbackScreen` (Task 6.9).
  const clearedRef = useRef(false);
  useEffect(() => {
    if (session.phase === "done" && session.submissionId && !clearedRef.current) {
      clearedRef.current = true;
      acknowledgeReadiness({
        submissionId: session.submissionId,
        module: "sprechen",
        acknowledgedAt: Date.now(),
      });
    }
  }, [session.phase, session.submissionId]);

  /* --------------------------------- render ---------------------------------- */

  if (topicStatus === "loading") {
    return (
      <div
        data-testid="sprechen-session-loading"
        className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8 lg:px-8"
      >
        <Skeleton.Card />
      </div>
    );
  }

  if (topicStatus === "not-found" || !topic) {
    return (
      <div
        data-testid="sprechen-session-not-found"
        className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8 lg:px-8"
      >
        <EmptyState
          testID="sprechen-session-topic-error"
          title={t("sprechen:session.topicNotFound.title")}
          description={t("sprechen:session.topicNotFound.body")}
          actionLabel={t("sprechen:session.topicNotFound.action")}
          onAction={() => router.push(`/${locale}/app/sprechen`)}
        />
      </div>
    );
  }

  const durationLabel = `${formatClock(recorder.durationMs)} / ${formatClock(cap)}`;
  const recorderUnavailable = recorder.errorMessage === "recorder_unavailable";
  const permissionDenied = recorder.permission === "denied";
  const statusLine = recorderUnavailable
    ? t("sprechen:record.errors.recorder_unavailable")
    : permissionDenied
      ? t("sprechen:record.errors.permission_denied")
      : recorder.durationMs >= cap
        ? t("sprechen:record.timeUp")
        : t("sprechen:record.listening");

  const isLanguageError = session.error === "language_not_german";
  const fallbackBannerLabel = isLanguageError
    ? t("sprechen:session.languageNotGermanBanner")
    : t("sprechen:feedback.fallbackBanner");
  // #54 — only the pure send-failure shape gets a retry: no submission was
  // ever reserved (`submissionId` reset to `null` by the hook's catch
  // block) AND the recording is still retained on-device. Every other
  // fallback cause either has a real submissionId (post-upload grading
  // failure/timeout/rejection — retrying would abandon a live submission,
  // not resume one) or no recording at all (`no_recording`).
  const canRetrySend = session.submissionId === null && session.recordingUri !== null;

  return (
    <div
      data-testid="sprechen-session-screen"
      className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6 lg:px-8"
    >
      {session.phase === "prep" ? (
        <PrepView
          topic={topic}
          outlineSteps={outlineSteps}
          onStart={handleStart}
          startDisabled={!recorderReady}
          showMicCheck={showMicCheck}
          micCheckStatus={micCheck.status}
          micCheckErrorCode={micCheck.errorMessage as MicCheckErrorCode | null}
          onMicCheckStart={handleMicCheckStart}
          onMicCheckSkip={handleMicCheckSkip}
        />
      ) : null}

      {session.phase === "record" ? (
        <RecordView
          topic={topic}
          durationLabel={durationLabel}
          statusLine={statusLine}
          recordingStatus={recorder.status}
          recorderLevels={recorder.levels}
          onStop={handleStop}
        />
      ) : null}

      {session.phase === "review" ? (
        <ReviewView
          recordingUri={session.recordingUri}
          durationMs={session.durationMs}
          isShort={isShortRecording}
          shortNote={t("sprechen:record.lengthWarning.body", {
            subgenre: t(`sprechen:record.lengthWarning.subgenres.${sessionSubgenre}`),
            level: sessionLevel,
            targetSec,
            actualSec: reviewActualSec,
          })}
          onRetake={handleReviewRetake}
          onSubmit={handleReviewSubmit}
        />
      ) : null}

      {session.phase === "submit" ? (
        <div
          data-testid="sprechen-session-submit-banner"
          className="rounded-[var(--radius-md)] border border-line-soft bg-bg-card px-4 py-6"
        >
          <AppText tone="secondary" size="body" align="center">
            {t("sprechen:record.submitting")}
          </AppText>
        </div>
      ) : null}

      {session.phase === "awaiting" ? (
        <div
          data-testid="sprechen-session-awaiting-banner"
          className="rounded-[var(--radius-md)] border border-line-soft bg-bg-card px-4 py-6"
        >
          <AppText tone="secondary" size="body" align="center">
            {t("sprechen:session.awaitingInline")}
          </AppText>
        </div>
      ) : null}

      {session.phase === "done" || session.phase === "fallback" ? (
        <FeedbackView
          submission={session.submission}
          fallback={session.phase === "fallback"}
          fallbackBannerLabel={fallbackBannerLabel}
          errorCode={isLanguageError ? null : session.error}
          onAcknowledge={handleAcknowledgeResult}
          onReset={handleReset}
          onGoHome={handleGoHome}
          onViewFullFeedback={handleViewFullFeedback}
          onRetry={session.phase === "fallback" && canRetrySend ? handleRetry : null}
        />
      ) : null}
    </div>
  );
}

/* ================================================================== */
/* Sub-views                                                           */
/* ================================================================== */

function BetreuerObservationCard({ testID }: { readonly testID?: string }) {
  const { t } = useTranslation(["sprechen"]);
  return (
    <div
      data-testid={testID ?? "sprechen-session-betreuer-card"}
      className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-line-soft bg-bg-card p-4"
    >
      <AppText tone="coach" size="caption" weight="semi" className="tracking-wide uppercase">
        {t("sprechen:prep.betreuerObservation.overline")}
      </AppText>
      <AppText tone="secondary" size="body" className="leading-6">
        {t("sprechen:prep.betreuerObservation.body")}
      </AppText>
    </div>
  );
}

interface PrepViewProps {
  readonly topic: TopicCard;
  readonly outlineSteps: readonly OutlineStep[];
  readonly onStart: () => void;
  readonly startDisabled: boolean;
  readonly showMicCheck: boolean;
  readonly micCheckStatus: string;
  readonly micCheckErrorCode: MicCheckErrorCode | null;
  readonly onMicCheckStart: () => void;
  readonly onMicCheckSkip: () => void;
}

function PrepView({
  topic,
  outlineSteps,
  onStart,
  startDisabled,
  showMicCheck,
  micCheckStatus,
  micCheckErrorCode,
  onMicCheckStart,
  onMicCheckSkip,
}: PrepViewProps) {
  const { t } = useTranslation(["sprechen"]);

  const micCheckCtaLabel =
    micCheckStatus === "error" || micCheckStatus === "done"
      ? t("sprechen:prep.micCheck.retry")
      : t("sprechen:prep.micCheck.start");
  const micCheckBusy =
    micCheckStatus === "requesting" ||
    micCheckStatus === "recording" ||
    micCheckStatus === "recorded" ||
    micCheckStatus === "playing";

  return (
    <>
      <div className="flex flex-col gap-1">
        <AppText family="serif" size="h1" weight="bold" testID="sprechen-session-title">
          {topic.titleDe}
        </AppText>
        {topic.subtitleFr ? (
          <AppText tone="secondary" size="body" className="italic">
            {topic.subtitleFr}
          </AppText>
        ) : null}
      </div>

      <div
        data-testid="sprechen-session-advice"
        className="flex flex-col gap-1 rounded-[var(--radius-lg)] border border-line-soft bg-bg-card p-4"
      >
        <AppText size="body" weight="semi">
          {t("sprechen:prep.advice.title")}
        </AppText>
        <AppText tone="secondary" size="body" className="leading-6">
          {t("sprechen:prep.advice.body")}
        </AppText>
      </div>

      {showMicCheck ? (
        <div
          data-testid="sprechen-session-mic-check"
          className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-line-soft bg-bg-card p-4"
        >
          <AppText size="body" weight="semi">
            {t("sprechen:prep.micCheck.title")}
          </AppText>
          <AppText tone="secondary" size="body" className="leading-6">
            {t("sprechen:prep.micCheck.intro")}
          </AppText>

          {micCheckStatus === "recording" ? (
            <AppText testID="sprechen-session-mic-check-status" tone="secondary" size="caption">
              {t("sprechen:prep.micCheck.recording", { remaining: MIC_CHECK_DURATION_S })}
            </AppText>
          ) : null}
          {micCheckStatus === "playing" ? (
            <AppText testID="sprechen-session-mic-check-status" tone="secondary" size="caption">
              {t("sprechen:prep.micCheck.playing")}
            </AppText>
          ) : null}
          {micCheckStatus === "done" ? (
            <AppText testID="sprechen-session-mic-check-status" tone="success" size="caption">
              {t("sprechen:prep.micCheck.done")}
            </AppText>
          ) : null}
          {micCheckStatus === "error" && micCheckErrorCode ? (
            <AppText testID="sprechen-session-mic-check-error" tone="warning" size="caption">
              {t(`sprechen:prep.micCheck.errors.${micCheckErrorCode}`)}
            </AppText>
          ) : null}

          <div className="mt-1 flex flex-col gap-2 sm:flex-row">
            <AppButton
              testID="sprechen-session-mic-check-cta"
              variant="outline"
              label={micCheckCtaLabel}
              onClick={onMicCheckStart}
              disabled={micCheckBusy}
            />
            <AppButton
              testID="sprechen-session-mic-check-skip"
              variant="ghost"
              label={t("sprechen:prep.micCheck.skip")}
              onClick={onMicCheckSkip}
            />
          </div>
        </div>
      ) : null}

      {outlineSteps.length > 0 ? (
        <div
          data-testid="sprechen-session-gliederung"
          className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-line-soft bg-bg-card p-4"
        >
          <AppText tone="coach" size="caption" weight="semi" className="tracking-wide uppercase">
            {t("sprechen:prep.gliederung.overline")}
          </AppText>
          <AppText tone="secondary" size="body" className="leading-6">
            {t("sprechen:prep.gliederung.intro")}
          </AppText>
          {outlineSteps.map((step) => (
            <div
              key={step.order}
              data-testid={`sprechen-session-gliederung-step-${step.order}`}
              className="flex flex-col gap-1"
            >
              <AppText family="serif" size="body" weight="semi" className="leading-6">
                {`${step.order}. ${step.de}`}
              </AppText>
              {step.fr ? (
                <AppText tone="secondary" size="caption" className="italic">
                  {step.fr}
                </AppText>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <BetreuerObservationCard testID="sprechen-session-betreuer-card" />
      )}

      <AppButton
        testID="sprechen-session-start-cta"
        label={t("sprechen:prep.cta")}
        onClick={onStart}
        disabled={startDisabled}
      />
    </>
  );
}

interface RecordViewProps {
  readonly topic: TopicCard;
  readonly durationLabel: string;
  readonly statusLine: string;
  readonly recordingStatus: string;
  readonly recorderLevels: readonly number[];
  readonly onStop: () => void;
}

function RecordView({
  topic,
  durationLabel,
  statusLine,
  recordingStatus,
  recorderLevels,
  onStop,
}: RecordViewProps) {
  const { t } = useTranslation(["sprechen"]);

  return (
    <>
      <AppText family="serif" size="h1" weight="bold">
        {topic.titleDe}
      </AppText>

      <div
        data-testid="sprechen-session-stage"
        className="flex flex-col items-center gap-2 rounded-[var(--radius-lg)] border border-line-soft bg-bg-card p-6"
      >
        <Waveform
          testID="sprechen-session-waveform"
          levels={recorderLevels}
          tone="cta"
          height={52}
          className="self-stretch"
        />
        <AppText testID="sprechen-session-timer" family="mono" size="h3" weight="semi" numeric>
          {`●  ${durationLabel}`}
        </AppText>
        <AppText testID="sprechen-session-status" tone="secondary" size="small" align="center">
          {statusLine}
        </AppText>
      </div>

      {/* anti-requirement 3 — empty transcript card, no live transcription on web. */}
      <div
        data-testid="sprechen-session-transcript-empty"
        className="rounded-[var(--radius-md)] border border-line-soft bg-bg-card p-4"
      >
        <AppText tone="secondary" size="small" align="center">
          {t("sprechen:record.transcript.empty")}
        </AppText>
      </div>

      <AppButton
        testID="sprechen-session-stop-cta"
        label={t("sprechen:record.actions.stop")}
        onClick={onStop}
        disabled={recordingStatus !== "recording"}
      />

      <AppText testID="sprechen-session-offline-note" tone="tertiary" size="caption" align="center">
        {t("sprechen:record.offlineNote")}
      </AppText>
    </>
  );
}

interface ReviewViewProps {
  readonly recordingUri: string | null;
  readonly durationMs: number;
  readonly isShort: boolean;
  readonly shortNote: string;
  readonly onRetake: () => void;
  readonly onSubmit: () => void;
}

/**
 * `review` phase (#373) — the learner has stopped recording. Nothing has
 * left the device. They replay their own local clip via `LocalAudioPlayer`
 * then decide to re-record (`onRetake`) or upload (`onSubmit`).
 */
function ReviewView({
  recordingUri,
  durationMs,
  isShort,
  shortNote,
  onRetake,
  onSubmit,
}: ReviewViewProps) {
  const { t } = useTranslation(["sprechen"]);

  return (
    <>
      <div
        data-testid="sprechen-session-review-card"
        className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-line-soft bg-bg-card p-4"
      >
        <AppText tone="secondary" size="body" className="leading-6">
          {t("sprechen:review.intro")}
        </AppText>
        {recordingUri ? <LocalAudioPlayer uri={recordingUri} /> : null}
        <AppText testID="sprechen-session-review-duration" tone="tertiary" size="caption" numeric>
          {`⏱ ${formatClock(durationMs)}`}
        </AppText>
        {isShort ? (
          <AppText testID="sprechen-session-review-short-note" tone="warning" size="caption">
            {shortNote}
          </AppText>
        ) : null}
      </div>

      <div className="flex gap-3">
        <AppButton
          testID="sprechen-session-review-retake"
          label={t("sprechen:review.retake")}
          variant="outline"
          onClick={onRetake}
          className="flex-1"
        />
        <AppButton
          testID="sprechen-session-review-submit"
          label={t("sprechen:review.submit")}
          onClick={onSubmit}
          className="flex-1"
        />
      </div>
    </>
  );
}

interface FeedbackViewProps {
  readonly submission: SprechenSubmission | null;
  readonly fallback: boolean;
  readonly fallbackBannerLabel: string;
  readonly errorCode: string | null;
  readonly onAcknowledge: () => void;
  readonly onReset: () => void;
  readonly onGoHome: () => void;
  readonly onViewFullFeedback: () => void;
  /**
   * Non-null only for the #54 target case: `submitRecording` failed before
   * a submission ever existed (reserve/PUT/finalize threw — the hook resets
   * `submissionId` to `null` but retains `recordingUri`/`durationMs`, see
   * `useSprechenSession`'s F2 contract). Re-runs the whole upload sequence
   * from the retained recording — never resurrects the abandoned
   * reservation. Null for every other fallback cause (no recording to
   * retry from, or a submission already exists server-side).
   */
  readonly onRetry: (() => void) | null;
}

function FeedbackView({
  submission,
  fallback,
  fallbackBannerLabel,
  errorCode,
  onAcknowledge,
  onReset,
  onGoHome,
  onViewFullFeedback,
  onRetry,
}: FeedbackViewProps) {
  const { t } = useTranslation(["sprechen"]);

  const dimensionScores = dimensionScoresFromWire(submission?.dimension_scores_json);
  const hasUnifiedData = (submission?.schema_version ?? 1) >= 2 && dimensionScores.length > 0;

  const fallbackBanner = fallback ? (
    <div
      data-testid="sprechen-session-fallback-banner"
      className="flex flex-col gap-1 rounded-[var(--radius-md)] border border-line-soft bg-bg-card px-4 py-3"
    >
      <AppText tone="secondary" size="caption">
        {fallbackBannerLabel}
      </AppText>
      {errorCode ? (
        <AppText testID="sprechen-session-error-code" tone="tertiary" size="caption">
          {`${t("sprechen:session.submitError")} · ${errorCode}`}
        </AppText>
      ) : null}
    </div>
  ) : null;

  if (!hasUnifiedData) {
    const isGraded = submission?.status === "graded";

    // #54 — a pure send failure (nothing was ever reserved server-side):
    // offer an explicit retry that starts the whole upload sequence over
    // from the retained recording, alongside the usual "back to home"
    // escape hatch — same EmptyState-plus-secondary-AppButton layout the
    // rejected-submission branch on `SprechenFeedbackScreen` already uses.
    if (onRetry) {
      return (
        <>
          {fallbackBanner}
          <div className="flex flex-col items-center gap-4">
            <EmptyState
              testID="sprechen-session-send-failed"
              title={t("sprechen:session.sendFailed.title")}
              description={t("sprechen:session.sendFailed.body")}
              actionLabel={t("sprechen:session.sendFailed.retry")}
              onAction={onRetry}
            />
            <AppButton
              testID="sprechen-session-send-failed-secondary"
              label={t("sprechen:session.sendFailed.secondaryCta")}
              onClick={onGoHome}
              variant="outline"
            />
          </div>
        </>
      );
    }

    return (
      <>
        {fallbackBanner}
        <EmptyState
          testID={
            isGraded ? "sprechen-session-graded-feedback-link" : "sprechen-session-empty-state"
          }
          title={
            isGraded
              ? t("sprechen:session.gradedNoInline.title")
              : t("sprechen:session.notGradedYet.title")
          }
          description={
            isGraded
              ? t("sprechen:session.gradedNoInline.body")
              : t("sprechen:session.notGradedYet.body")
          }
          actionLabel={
            isGraded
              ? t("sprechen:session.gradedNoInline.action")
              : t("sprechen:session.notGradedYet.action")
          }
          onAction={isGraded ? onViewFullFeedback : onGoHome}
        />
      </>
    );
  }

  const fb = submission?.feedback_json;

  return (
    <>
      {fallbackBanner}
      <ModuleResultLayout
        testID="sprechen-session-module-result"
        dimensionScores={dimensionScores}
        coachFeedbackFr={fb?.coach_feedback_fr ?? null}
        nextDrillFr={fb?.next_drill_fr ?? null}
        focusAreas={fb?.focus_areas ?? []}
        personalizedModelDe={fb?.model_answer_de ?? null}
        normalizedTotalPct={submission?.normalized_total_pct ?? null}
        rawText={submission?.transcript_de ?? null}
      />
      <div className="mt-2 flex gap-3">
        <AppButton
          testID="sprechen-session-replay-cta"
          label={t("sprechen:feedback.replayCta")}
          variant="outline"
          onClick={onReset}
          className="flex-1"
        />
        <AppButton
          testID="sprechen-session-acknowledge-cta"
          label={t("sprechen:session.ctaAcknowledge")}
          onClick={onAcknowledge}
          className="flex-1"
        />
      </div>
    </>
  );
}
