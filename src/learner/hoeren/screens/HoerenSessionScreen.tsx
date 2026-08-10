"use client";

/**
 * `HoerenSessionScreen` — the Hören Teil-stepper session player (Task 5.7).
 * Web port of `deutschfit-mobile/src/features/hoeren/screens/HoerenSessionScreen.tsx`
 * (1–469), both operating modes.
 *
 * Unlike Lesen (one item per screen, `useExamPlayer`'s own cursor), Hören
 * steps one Teil at a time — `currentPartIndex` is screen-local state, and
 * every item in the active Teil renders together under its shared audio
 * track (mirrors mobile exactly; `useExamPlayer`'s `current`/`goNext`/
 * `goPrev` are not used here).
 *
 * Operating modes:
 *   - Practice mode — no route params (Apprendre mount, optional `slug`
 *     from the practice-set picker). Grading is local via
 *     `submitHoerenSession` (Task 5.6); the screen synthesizes a
 *     `local-<sessionId>` attempt id before calling it — mobile's own
 *     practice-branch convention (mobile 196–198), carried forward from
 *     the 5.6 review because `HoerenSubmissionRequest.attemptId` is a
 *     required `string`, not nullable.
 *   - Live (Examen) mode — `attemptId` + `mockAttemptId` route params
 *     drive submit → advance/finalize, exactly as `LesenSessionScreen`
 *     (S4 Task 4.9), which this file otherwise mirrors idiom-for-idiom:
 *     the once-ref `exam_module_started` guard, the deferred-promise
 *     re-entrancy guard on submit (`isSubmittingRef` + `isMountedRef`,
 *     Constraint 9), and the session-service routing for finalize/advance
 *     (`@/learner/core/exam/mockExamSession`, P13 — mobile calls the wire
 *     fns directly; web routes through the same Dexie-backed service
 *     Lesen uses, which is why `finalizeSession`/`advanceSession` also
 *     gate on a resolved `userId`, a web-only addition mobile has no
 *     equivalent for).
 *   - **Drill branch** (`moduleFilter === "HOEREN"`): finalizes directly
 *     after `submitHoeren`, with no `advanceSession` call — Hören can
 *     finalize a mock attempt straight from `lesen_done` (P6; same
 *     session-service routing and `normaliseReport` → `SkillScore[]` fold
 *     as Lesen's own drill branch).
 *   - **Full-simulation branch** (any other `moduleFilter`, S8 · Task 8.5
 *     — activated; dormant since S5): `submitHoeren` → records the
 *     module's raw/total/unanswered outcome into `useSimulationRun` (P10)
 *     → `advanceSession` → `nextModule !== null` hands the route back to
 *     the orchestrator (P6: `router.replace('/examen/simulation?
 *     examSlug=...')`, mirroring mobile's parent-owned chain-continuation
 *     intent — mobile `LesenSessionScreen.tsx:237–241`, same citation
 *     Lesen's own branch uses). The real backend always answers a
 *     finished HÖREN with `next_module:"SCHREIBEN"`
 *     (`mock-exam-advance/index.ts:128–133`) — this is branch (c) in the
 *     test suite. `nextModule === null` finalizes into
 *     `useSimulationRun.setResult` and routes to
 *     `/examen/simulation/results`; this is DEFENSIVE PARITY ONLY (branch
 *     c′) and can only fire against a misbehaving server.
 *
 * Both modes fetch from the server, so the loading / error / unsupported /
 * empty gates key off `status` (from `useHoerenSession`), not the mode.
 *
 * #472 guard: `isSessionReady = status === "ready" && player.session.parts.length > 0`
 * gates both `handleSubmit` and the timer-expiry effect — while the fetch
 * is in flight the hook returns a 0-duration/0-part placeholder session,
 * and nothing may submit it (a 0-part session is also untimed —
 * `useExamTimer`'s `computeTimerState` treats non-positive duration as
 * never-expiring — so the guard is the only thing stopping a forced/mocked
 * expiry from submitting an empty session).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useTranslation } from "react-i18next";
import clsx from "clsx";

import { normaliseReport, submitHoeren } from "@/learner/core/api/examApi";
import { trackEvent } from "@/learner/core/analytics/posthog";
import { useLearnerSession } from "@/learner/core/auth/useLearnerSession";
import type { MockExamModule } from "@/learner/core/exam/mockExamSession";
import { advanceSession, finalizeSession } from "@/learner/core/exam/mockExamSession";
import type { SessionScore } from "@/learner/core/exam/engine/scoring";
import { toSkillScores } from "@/learner/core/exam/skillScores";
import type { SkillScore } from "@/learner/core/exam/skillScores";
import { minutesToMs, useExamTimer } from "@/learner/core/exam/useExamTimer";
import { AppText, EmptyState, ProgressBar, Skeleton, TimerPill } from "@/learner/ui/primitives";

import { HoerenAudioPlayer } from "../components/HoerenAudioPlayer";
import { useHoerenSession } from "../hooks/useHoerenSession";
import { submitHoerenSession } from "../api/submit";
import { useHoerenResultsStore, type HoerenResultsMode } from "../resultsStore";
import { useSimulationRun } from "@/learner/core/exam/simulationRunStore";

export interface HoerenSessionScreenProps {
  readonly attemptId?: string;
  readonly examSlug?: string;
  readonly mockAttemptId?: string;
  readonly moduleFilter?: string;
  /** Practice-set picker selection (P14, web delta — mobile has none). */
  readonly slug?: string;
}

interface OptionRowProps {
  readonly optKey: string;
  readonly text: string;
  readonly picked: boolean;
  readonly disabled: boolean;
  readonly onSelect: () => void;
}

function OptionRow({ optKey, text, picked, disabled, onSelect }: OptionRowProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={picked}
      data-testid={`hoeren-option-${optKey}`}
      disabled={disabled}
      onClick={onSelect}
      className={clsx(
        "flex min-h-14 w-full items-center gap-3 rounded-[var(--radius-md)] border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60",
        picked ? "border-accent-gold bg-accent-gold/15" : "border-line-strong bg-bg-card",
        !disabled && "hover:opacity-90"
      )}
    >
      <span
        className={clsx(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border",
          picked ? "border-text-primary bg-text-primary" : "border-line-strong bg-bg-hero"
        )}
      >
        <AppText tone={picked ? "inverse" : "primary"} size="body" weight="semi" numeric>
          {optKey.toUpperCase()}
        </AppText>
      </span>
      <AppText tone="primary" size="body" weight="medium" className="flex-1">
        {text}
      </AppText>
    </button>
  );
}

const CONTAINER_CLASS = "flex min-h-screen flex-col";

export function HoerenSessionScreen({
  attemptId: attemptIdParam,
  examSlug,
  mockAttemptId,
  moduleFilter,
  slug,
}: HoerenSessionScreenProps) {
  const router = useRouter();
  const locale = useLocale();
  const { t } = useTranslation(["apprendre"]);

  const hookArgs =
    attemptIdParam !== undefined
      ? { attemptId: attemptIdParam }
      : examSlug !== undefined
        ? { examSlug }
        : slug !== undefined
          ? { slug }
          : {};

  const { player, audioUrlBySlug, reload, status, attemptId } = useHoerenSession(hookArgs);

  const [currentPartIndex, setCurrentPartIndex] = useState(0);
  const [startMs] = useState(() => Date.now());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const isMountedRef = useRef(true);
  const startedRef = useRef(false);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // `exam_module_started` fires once per live-mode entry — the ref (not a
  // dep-array trick) is the source of truth so StrictMode's double-render
  // can never double-fire it. Practice mode has no server attempt id, so
  // this is a no-op there (mobile 90–101).
  useEffect(() => {
    if (startedRef.current) return;
    if (status !== "ready" || !attemptId) return;
    startedRef.current = true;
    trackEvent("exam_module_started", {
      attempt_id: attemptId,
      module: "HOEREN",
      resumed: Boolean(attemptIdParam),
    });
  }, [status, attemptId, attemptIdParam]);

  // #472 — while the server fetch is in flight the hook returns a
  // 0-minute/0-part placeholder; nothing may submit it.
  const isSessionReady = status === "ready" && player.session.parts.length > 0;
  const durationMs = minutesToMs(player.session.totalDurationMinutes);

  // If a reload swaps in a session with fewer Teile, clamp the stepper so
  // we never strand the learner past the end on the controls-less empty
  // state (mobile 247–252).
  useEffect(() => {
    const partCount = player.session.parts.length;
    if (partCount > 0) {
      setCurrentPartIndex((i) => Math.min(i, partCount - 1));
    }
  }, [player.session.parts.length]);

  const goToResults = useCallback(
    (
      submissionId: string,
      score: SessionScore,
      mode: HoerenResultsMode,
      skills?: readonly SkillScore[]
    ): void => {
      useHoerenResultsStore.getState().set({
        submissionId,
        score,
        mode,
        ...(skills ? { skills } : {}),
        ...(attemptId ? { attemptId } : {}),
      });
      router.push(`/${locale}/app/hoeren/results`);
    },
    [attemptId, locale, router]
  );

  const handleSubmit = useCallback(async (): Promise<void> => {
    if (isSubmittingRef.current || !isSessionReady) return;
    isSubmittingRef.current = true;
    setIsSubmitting(true);

    const localScore = player.submit();
    const sessionId = player.session.id;
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
    const userId = useLearnerSession.getState().session?.user.id ?? null;

    const finishSubmitting = (): void => {
      isSubmittingRef.current = false;
      if (isMountedRef.current) setIsSubmitting(false);
    };

    // Live (Examen) mode — submit → (drill: finalize directly) or
    // (full exam: advance → optional finalize), exactly as Lesen (S4
    // P13). Requires both the module `attemptId` and the parent
    // `mockAttemptId`, plus a resolved `userId` (the session-service
    // routing this facade uses caches by user id — a web-only
    // requirement mobile's direct wire-fn calls don't have).
    if (attemptId && mockAttemptId && userId) {
      if (moduleFilter === "HOEREN") {
        try {
          trackEvent("exam_module_submitted", {
            attempt_id: attemptId,
            module: "HOEREN",
            duration_ms: Date.now() - startMs,
          });
          await submitHoeren({ attemptId, answers: player.answers });
          const finalized = await finalizeSession({
            userId,
            examSlug: player.session.examSlug,
            mockAttemptId,
            answers: player.answers,
          });
          trackEvent("exam_module_drill_finalized", {
            attempt_id: mockAttemptId,
            module: "HOEREN",
          });
          const skills = toSkillScores(normaliseReport(finalized.perCompetenceReport));
          goToResults(finalized.mockAttemptId, localScore, "graded", skills);
        } catch {
          goToResults(`local-${sessionId}-${Date.now()}`, localScore, "graded");
        } finally {
          finishSubmitting();
        }
        return;
      }

      try {
        trackEvent("exam_module_submitted", {
          attempt_id: attemptId,
          module: "HOEREN",
          duration_ms: Date.now() - startMs,
        });
        const submitResponse = await submitHoeren({ attemptId, answers: player.answers });
        // Web delta (P10): feeds the results donut with real counts —
        // `raw` is the server-authoritative score, `total`/`unanswered`
        // come from the same local `SessionScore` derivation this branch
        // already computes for the (unused-here) drill result.
        useSimulationRun.getState().recordOutcome(
          "hoeren",
          {
            raw: submitResponse.raw_score,
            total: localScore.total,
            unanswered: localScore.unanswered,
          },
          player.session.totalDurationMinutes
        );
        const finishedModule: MockExamModule = "HOEREN";
        const advanced = await advanceSession({
          userId,
          examSlug: player.session.examSlug,
          mockAttemptId,
          finishedModule,
        });
        trackEvent("exam_advance", {
          attempt_id: mockAttemptId,
          finished_module: "HOEREN",
          next_module: advanced.nextModule,
        });
        if (advanced.nextModule !== null) {
          // Web delta (P6): parent-owned chain continuation — mobile drops
          // onto per-module results and documents the parent as the
          // intended owner (mobile LesenSessionScreen.tsx:237–241). Branch
          // (c): the real backend always answers a finished HÖREN with
          // `next_module:"SCHREIBEN"`.
          router.replace(`/${locale}/app/examen/simulation?examSlug=${player.session.examSlug}`);
        } else {
          // DEFENSIVE PARITY ONLY (branch c′) — the real backend never
          // returns `next_module:null` for a finished HÖREN (advance
          // always answers "SCHREIBEN"; see the doc comment above). Kept
          // as shipped S4/S5 dormant parity, edited here only for target
          // consistency.
          const finalized = await finalizeSession({
            userId,
            examSlug: player.session.examSlug,
            mockAttemptId,
            answers: player.answers,
          });
          trackEvent("exam_finalized", {
            attempt_id: mockAttemptId,
            duration_ms: Date.now() - startMs,
          });
          const skills = toSkillScores(normaliseReport(finalized.perCompetenceReport));
          useSimulationRun.getState().setResult({
            report: finalized.perCompetenceReport,
            skills,
            finalizedAt: finalized.finalizedAt,
          });
          router.replace(`/${locale}/app/examen/simulation/results`);
        }
      } catch {
        goToResults(`local-${sessionId}-${Date.now()}`, localScore, "graded");
      } finally {
        finishSubmitting();
      }
      return;
    }

    // Practice / standalone — local grading. `submitHoerenSession` tries
    // `hoeren-submit` and falls back to `scoreSession` on any failure, so
    // the learner always reaches results. `attemptId` is a required
    // `string` on `HoerenSubmissionRequest` (Task 5.6 review finding) —
    // synthesize it here exactly as mobile's practice branch does
    // (mobile 196–198), never pass `null`.
    try {
      const result = await submitHoerenSession({
        attemptId: `local-${sessionId}`,
        session: player.session,
        answers: player.answers,
        elapsedSeconds,
        submittedAt: new Date().toISOString(),
      });
      goToResults(result.submissionId, result.score, "practice");
    } catch {
      goToResults(`local-${sessionId}-${Date.now()}`, localScore, "practice");
    } finally {
      finishSubmitting();
    }
  }, [
    isSessionReady,
    player,
    attemptId,
    mockAttemptId,
    moduleFilter,
    startMs,
    goToResults,
    router,
    locale,
  ]);

  const onExpire = useCallback(() => {
    void handleSubmit();
  }, [handleSubmit]);

  const timer = useExamTimer({ startMs, durationMs, onExpire });

  // Belt-and-braces: if expiry slips past the timer's own callback, submit
  // on the next render (mobile 228–243).
  useEffect(() => {
    if (isSessionReady && timer.isExpired && !player.isSubmitted && !isSubmittingRef.current) {
      void handleSubmit();
    }
  }, [isSessionReady, timer.isExpired, player.isSubmitted, handleSubmit]);

  // Server-fetch hydration gates — practice AND live both fetch, so branch
  // on `status` (not the mode) before falling into the player.
  if (status === "loading") {
    return (
      <div
        className={clsx(CONTAINER_CLASS, "gap-4 px-4 py-8")}
        data-testid="hoeren-session-loading"
      >
        <Skeleton.Block width="60%" height={20} />
        <Skeleton.Block width="100%" height={120} />
        <Skeleton.Card />
      </div>
    );
  }

  // #473 — the hook resolved `toPracticeLevel(level)` to null: this exam
  // track has no Hören practice content yet. No request was made; render
  // the empty state (P5).
  if (status === "unsupported") {
    return (
      <div className={clsx(CONTAINER_CLASS, "items-center justify-center px-6 py-8")}>
        <EmptyState
          testID="hoeren-session-unsupported"
          title={t("apprendre:practice.emptyTitle")}
          description={t("apprendre:practice.unsupported")}
          actionLabel={t("apprendre:practice.session.backToHub")}
          onAction={() => router.back()}
        />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className={clsx(CONTAINER_CLASS, "items-center justify-center px-6 py-8")}>
        <EmptyState
          testID="hoeren-session-error"
          title={t("apprendre:practice.session.errorTitle")}
          actionLabel={t("apprendre:practice.session.retry")}
          onAction={reload}
        />
      </div>
    );
  }

  const parts = player.session.parts;
  const part = parts[currentPartIndex];
  if (parts.length === 0 || !part) {
    return (
      <div className={clsx(CONTAINER_CLASS, "items-center justify-center px-6 py-8")}>
        <EmptyState testID="hoeren-session-empty" title={t("apprendre:practice.emptyTitle")} />
      </div>
    );
  }

  // Per the spec, one continuous audio track plays per Teil. The track
  // slug is carried on the Teil's items as `stimulusSlug`; the signed URL
  // lives in `audioUrlBySlug` (mobile 344–349, byte-identical expression).
  const trackSlug = part.items[0]?.stimulusSlug ?? null;
  const trackUrl = trackSlug ? (audioUrlBySlug[trackSlug] ?? null) : null;
  const isLastPart = currentPartIndex === parts.length - 1;
  const optionsDisabled = timer.isExpired || isSubmitting;

  return (
    <div className={CONTAINER_CLASS} data-testid="hoeren-session-container">
      <div className="flex items-center justify-between gap-4 border-b border-line-soft px-4 py-4 lg:px-8">
        <div className="flex-1">
          <AppText
            tone="secondary"
            size="small"
            weight="medium"
            className="uppercase tracking-wide"
          >
            {part.label}
          </AppText>
          <AppText tone="primary" size="body" weight="semi" className="mt-1">
            {`Teil ${currentPartIndex + 1} von ${parts.length}`}
          </AppText>
        </div>
        <TimerPill
          remainingMs={timer.remainingSeconds * 1000}
          state={timer.isExpired ? "danger" : timer.elapsedFraction > 0.85 ? "warning" : "idle"}
        />
      </div>

      <div className="flex items-center gap-3 px-4 pb-4 pt-3 lg:px-8">
        <ProgressBar
          value={player.totalCount > 0 ? player.answeredCount / player.totalCount : 0}
          tone="gold"
          aria-label="Beantwortet"
          className="flex-1"
        />
        <AppText family="mono" size="small" tone="secondary" numeric>
          {`${player.answeredCount} / ${player.totalCount}`}
        </AppText>
      </div>

      <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 pb-8 lg:px-8">
        <HoerenAudioPlayer url={trackUrl} missing={!trackUrl} onReload={reload} />

        {part.instructions ? (
          <AppText tone="secondary" size="body">
            {part.instructions}
          </AppText>
        ) : null}

        {part.items.map((item) => (
          <div key={item.id} className="flex flex-col gap-4">
            <AppText tone="secondary" size="small" weight="medium">
              {`Aufgabe ${item.number}`}
            </AppText>
            <AppText as="h2" family="serif" size="h3" weight="semi">
              {item.stem ?? t("apprendre:practice.session.missingStem")}
            </AppText>
            <div
              role="radiogroup"
              aria-label={item.stem ?? `Aufgabe ${item.number}`}
              className="flex flex-col gap-2"
            >
              {item.options.map((opt) => (
                <OptionRow
                  key={opt.key}
                  optKey={opt.key}
                  text={opt.text}
                  picked={(player.answers[item.id] ?? null) === opt.key}
                  disabled={optionsDisabled}
                  onSelect={() => player.pick(item.id, opt.key)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-3 border-t border-line-soft px-4 py-4 lg:px-8">
        <button
          type="button"
          data-testid="hoeren-session-prev"
          disabled={currentPartIndex === 0}
          onClick={() => setCurrentPartIndex((i) => Math.max(0, i - 1))}
          className="min-h-12 flex-1 rounded-[var(--radius-md)] border border-line-strong px-6 disabled:opacity-40"
        >
          <AppText tone="primary" size="body" weight="semi">
            Zurück
          </AppText>
        </button>
        {isLastPart ? (
          <button
            type="button"
            data-testid="hoeren-session-submit"
            disabled={isSubmitting}
            onClick={() => {
              void handleSubmit();
            }}
            className="min-h-12 flex-1 rounded-[var(--radius-md)] bg-text-primary px-6 disabled:opacity-50"
          >
            <AppText tone="inverse" size="body" weight="semi">
              {isSubmitting ? "Wird abgegeben…" : "Abgeben"}
            </AppText>
          </button>
        ) : (
          <button
            type="button"
            data-testid="hoeren-session-next"
            onClick={() => setCurrentPartIndex((i) => Math.min(parts.length - 1, i + 1))}
            className="min-h-12 flex-1 rounded-[var(--radius-md)] bg-text-primary px-6"
          >
            <AppText tone="inverse" size="body" weight="semi">
              Weiter
            </AppText>
          </button>
        )}
      </div>
    </div>
  );
}
