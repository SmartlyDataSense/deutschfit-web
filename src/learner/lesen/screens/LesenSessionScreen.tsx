"use client";

/**
 * `LesenSessionScreen` — the graded Lesen live session player (Task 4.9).
 * Web port of `deutschfit-mobile/src/features/lesen/screens/LesenSessionScreen.tsx`,
 * live-mode branch only (mobile's fixture-mode `submitLesenSession` fallback
 * has no web equivalent — S4 has no fixture path, see `useLesenSession`'s
 * doc comment). German exam chrome/copy is byte-identical to mobile
 * (content, not app chrome — same split every other Examen screen uses).
 *
 * Submit flow (`handleSubmit`) mirrors mobile's three branches exactly:
 *
 *   1. `attemptId && mockAttemptId` + `moduleFilter === "LESEN"` — the
 *      single-module drill path. `submitLesen` → `finalizeSession`
 *      (P13: routed through the mockExamCache session service, not
 *      `examApi.finalizeMockExam` directly — the stated web deviation)
 *      → skills derived via `normaliseReport` → results.
 *   2. `attemptId && mockAttemptId`, any other `moduleFilter` — the
 *      full-simulation path. `submitLesen` → `advanceSession` →
 *      `nextModule === null` finalizes now; otherwise hands back local
 *      results with the live `attemptId` (dormant until S5 wires HÖREN).
 *   3. Missing either id — results are local-only, no network call.
 *
 * Every `catch` in branches 1–2 falls through to a local-graded result
 * keyed `local-<sessionId>-<timestamp>` — this is also where a 429
 * `rate_limited` free-tier rejection lands, by design (P1/P3): there is
 * no error screen, no paywall/upsell copy on any submit branch.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import clsx from "clsx";

import { normaliseReport, submitLesen } from "@/learner/core/api/examApi";
import { trackEvent } from "@/learner/core/analytics/posthog";
import { useLearnerSession } from "@/learner/core/auth/useLearnerSession";
import type { MockExamModule } from "@/learner/core/exam/mockExamSession";
import { advanceSession, finalizeSession } from "@/learner/core/exam/mockExamSession";
import type { SessionScore } from "@/learner/core/exam/engine/scoring";
import { minutesToMs, useExamTimer } from "@/learner/core/exam/useExamTimer";
import { AppText, EmptyState, ProgressBar, Skeleton, TimerPill } from "@/learner/ui/primitives";

import { useLesenSession } from "../hooks/useLesenSession";
import { useLesenResultsStore, type SkillScore } from "../resultsStore";
import { toSkillScores } from "@/learner/core/exam/skillScores";

export interface LesenSessionScreenProps {
  readonly examSlug?: string;
  readonly attemptId?: string;
  readonly mockAttemptId?: string;
  readonly moduleFilter?: string;
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
      data-testid={`lesen-option-${optKey}`}
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

export function LesenSessionScreen({
  examSlug,
  attemptId: attemptIdParam,
  mockAttemptId,
  moduleFilter,
}: LesenSessionScreenProps) {
  const router = useRouter();
  const locale = useLocale();

  const hookArgs =
    attemptIdParam !== undefined
      ? { attemptId: attemptIdParam }
      : examSlug !== undefined
        ? { examSlug }
        : {};
  const { player, readingTexts, status, attemptId } = useLesenSession(hookArgs);

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
  // can never double-fire it.
  useEffect(() => {
    if (startedRef.current) return;
    if (status !== "ready" || !attemptId) return;
    startedRef.current = true;
    trackEvent("exam_module_started", {
      attempt_id: attemptId,
      module: "LESEN",
      resumed: Boolean(attemptIdParam),
    });
  }, [status, attemptId, attemptIdParam]);

  const isSessionReady = status === "ready" && player.session.parts.length > 0;
  const durationMs = minutesToMs(player.session.totalDurationMinutes);

  const goToResults = useCallback(
    (submissionId: string, score: SessionScore, skills?: readonly SkillScore[]): void => {
      useLesenResultsStore.getState().set({
        submissionId,
        score,
        ...(skills ? { skills } : {}),
        ...(attemptId ? { attemptId } : {}),
      });
      router.push(`/${locale}/app/examen/lesen/results`);
    },
    [attemptId, locale, router]
  );

  const handleSubmit = useCallback(async (): Promise<void> => {
    if (isSubmittingRef.current || !isSessionReady) return;
    isSubmittingRef.current = true;
    setIsSubmitting(true);

    const localScore = player.submit();
    const sessionId = player.session.id;
    const userId = useLearnerSession.getState().session?.user.id ?? null;

    const finishSubmitting = (): void => {
      isSubmittingRef.current = false;
      if (isMountedRef.current) setIsSubmitting(false);
    };

    if (attemptId && mockAttemptId && userId) {
      if (moduleFilter === "LESEN") {
        try {
          trackEvent("exam_module_submitted", {
            attempt_id: attemptId,
            module: "LESEN",
            duration_ms: Date.now() - startMs,
          });
          await submitLesen({ attemptId, answers: player.answers });
          const finalized = await finalizeSession({
            userId,
            examSlug: player.session.examSlug,
            mockAttemptId,
            answers: player.answers,
          });
          trackEvent("exam_module_drill_finalized", {
            attempt_id: mockAttemptId,
            module: "LESEN",
          });
          const skills = toSkillScores(normaliseReport(finalized.perCompetenceReport));
          goToResults(finalized.mockAttemptId, localScore, skills);
        } catch {
          goToResults(`local-${sessionId}-${Date.now()}`, localScore);
        } finally {
          finishSubmitting();
        }
        return;
      }

      try {
        trackEvent("exam_module_submitted", {
          attempt_id: attemptId,
          module: "LESEN",
          duration_ms: Date.now() - startMs,
        });
        await submitLesen({ attemptId, answers: player.answers });
        const finishedModule: MockExamModule = "LESEN";
        const advanced = await advanceSession({
          userId,
          examSlug: player.session.examSlug,
          mockAttemptId,
          finishedModule,
        });
        trackEvent("exam_advance", {
          attempt_id: mockAttemptId,
          finished_module: "LESEN",
          next_module: advanced.nextModule,
        });
        if (advanced.nextModule === null) {
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
          goToResults(finalized.mockAttemptId, localScore, skills);
        } else {
          goToResults(attemptId, localScore);
        }
      } catch {
        goToResults(`local-${sessionId}-${Date.now()}`, localScore);
      } finally {
        finishSubmitting();
      }
      return;
    }

    // Without both a module attempt id and a mock attempt id, results are
    // local-only — no network call is attempted (brief P1/P3).
    goToResults(`local-${sessionId}-${Date.now()}`, localScore);
    finishSubmitting();
  }, [isSessionReady, player, attemptId, mockAttemptId, moduleFilter, startMs, goToResults]);

  const onExpire = useCallback(() => {
    void handleSubmit();
  }, [handleSubmit]);

  const timer = useExamTimer({ startMs, durationMs, onExpire });

  // Belt-and-braces: if expiry slips past the timer's own callback (e.g. a
  // backgrounded tab throttling `setInterval`), submit on the next render.
  useEffect(() => {
    if (isSessionReady && timer.isExpired && !player.isSubmitted && !isSubmittingRef.current) {
      void handleSubmit();
    }
  }, [isSessionReady, timer.isExpired, player.isSubmitted, handleSubmit]);

  if (status === "loading") {
    // Founding-doc §17 — silent skeleton, no spinner/percentage copy.
    return (
      <div className={clsx(CONTAINER_CLASS, "gap-4 px-4 py-8")} data-testid="lesen-session-loading">
        <Skeleton.Block width="60%" height={20} />
        <Skeleton.Block width="100%" height={120} />
        <Skeleton.Card />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className={clsx(CONTAINER_CLASS, "items-center justify-center px-6 py-8")}>
        <EmptyState
          testID="lesen-session-error"
          title="Der Modelltest konnte nicht geladen werden"
          description="Bitte versuche es später erneut."
          actionLabel="Zurück"
          onAction={() => router.back()}
        />
      </div>
    );
  }

  const current = player.current;
  if (!current) {
    return (
      <div className={clsx(CONTAINER_CLASS, "items-center justify-center px-6 py-8")}>
        <AppText tone="secondary" size="body" align="center">
          Keine Aufgaben in dieser Sitzung.
        </AppText>
      </div>
    );
  }

  const reading = current.item.stimulusSlug ? readingTexts[current.item.stimulusSlug] : undefined;
  const pickedKey = player.answers[current.item.id] ?? null;
  const optionsDisabled = timer.isExpired || isSubmitting;

  return (
    <div className={CONTAINER_CLASS} data-testid="lesen-session-screen">
      <div className="flex items-center justify-between gap-4 border-b border-line-soft px-4 py-4 lg:px-8">
        <div className="flex-1">
          <AppText
            tone="secondary"
            size="small"
            weight="medium"
            className="uppercase tracking-wide"
          >
            {current.partLabel}
          </AppText>
          <AppText
            tone="primary"
            size="body"
            weight="semi"
            className="mt-1"
            testID="lesen-session-total"
          >
            {`Frage ${player.currentIndex + 1} von ${player.totalCount}`}
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
        {reading ? (
          <div className="rounded-[var(--radius-lg)] border border-line-subtle bg-bg-card p-6">
            <AppText
              tone="secondary"
              size="small"
              weight="medium"
              className="mb-2 uppercase tracking-wide"
            >
              {reading.label}
            </AppText>
            <AppText tone="primary" size="body">
              {reading.bodyMd ?? "(Text wird in einer kommenden Inhaltsversion ergänzt.)"}
            </AppText>
          </div>
        ) : null}

        <div className="flex flex-col gap-4">
          <AppText tone="secondary" size="small" weight="medium">
            {`Aufgabe ${current.item.number}`}
          </AppText>
          <AppText as="h2" family="serif" size="h3" weight="semi">
            {current.item.stem ?? "(Frage wird in einer kommenden Inhaltsversion ergänzt.)"}
          </AppText>
          <div
            role="radiogroup"
            aria-label={current.item.stem ?? `Aufgabe ${current.item.number}`}
            data-testid="lesen-session-option-list"
            className="flex flex-col gap-2"
          >
            {current.item.options.map((opt) => (
              <OptionRow
                key={opt.key}
                optKey={opt.key}
                text={opt.text}
                picked={pickedKey === opt.key}
                disabled={optionsDisabled}
                onSelect={() => player.pick(current.item.id, opt.key)}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-3 border-t border-line-soft px-4 py-4 lg:px-8">
        <button
          type="button"
          data-testid="lesen-session-prev"
          disabled={player.isFirst}
          onClick={player.goPrev}
          className="min-h-12 flex-1 rounded-[var(--radius-md)] border border-line-strong px-6 disabled:opacity-40"
        >
          <AppText tone="primary" size="body" weight="semi">
            Zurück
          </AppText>
        </button>
        {player.isLast ? (
          <button
            type="button"
            data-testid="lesen-session-submit"
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
            data-testid="lesen-session-next"
            onClick={player.goNext}
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
