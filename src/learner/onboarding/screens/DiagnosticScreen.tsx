"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useTranslation } from "react-i18next";
import clsx from "clsx";

import { trackEvent } from "@/learner/core/analytics/posthog";
import { AppButton, AppText, Chip } from "@/learner/ui/primitives";

import {
  getDiagnosticQuestions,
  type DiagnosticQuestionsResponse,
} from "../services/getDiagnosticQuestions";
import { submitDiagnostic } from "../services/submitDiagnostic";
import { formatClock } from "../services/formatClock";
import {
  selectCurrentQuestion,
  useDiagnosticAttemptStore,
} from "../state/useDiagnosticAttemptStore";

const RETRIES_BEFORE_SKIP = 2;
const TIMER_TICK_MS = 1000;

export interface DiagnosticScreenProps {
  readonly attemptId: string;
  readonly level: "b1" | "b2";
  readonly mode: "onboarding" | "retake";
}

/**
 * Onboarding Diagnostic v2 — section-aware exam-shaped screen
 * (spec 2026-05-04 §3.5). Web port of `deutschfit-mobile/src/features/
 * onboarding/screens/OnboardingDiagnosticScreen.tsx` — same hooks and
 * state machine, RN views translated to divs/buttons.
 *
 * 15 MCQs split into three timed sections:
 *   Lesen (4 items, 300s) → Sprachbausteine (6 items, 300s) → Wortschatz (5 items, 180s)
 *
 * Purely presentational as far as routing goes: `attemptId`/`level`/`mode`
 * are props — URL parsing lives entirely in `diagnostic/page.tsx`.
 *
 * Q15 P0 fix retained: `RETRIES_BEFORE_SKIP = 2` failed submits surface
 * a "Finish later" fallback; the section timer pauses while a submit
 * error is on screen so the user is not pressured during retry.
 */
export function DiagnosticScreen({ attemptId, level, mode }: DiagnosticScreenProps) {
  const router = useRouter();
  const locale = useLocale();
  const { t } = useTranslation(["onboarding", "common"]);

  const {
    viewModel,
    currentIndex,
    answers,
    elapsedSecPerSection,
    status,
    hydrate,
    recordAnswer,
    advance,
    setStatus,
    setResult,
    reset,
  } = useDiagnosticAttemptStore();

  const [selected, setSelected] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchedForRef = useRef<string | null>(null);

  const fetchPack = useCallback(
    (cancelledRef: { current: boolean }) => {
      setStatus("loading");
      void (async () => {
        try {
          const dto: DiagnosticQuestionsResponse = await getDiagnosticQuestions({
            attemptId,
            level: level === "b2" ? "b2" : "b1",
          });
          if (cancelledRef.current) return;
          hydrate(dto);
        } catch (err) {
          if (cancelledRef.current) return;
          const code =
            err instanceof Error && err.message ? err.message : "diagnostic_questions_failed";
          setLoadError(code);
          setStatus("error", code);
        }
      })();
    },
    [attemptId, level, hydrate, setStatus]
  );

  // Hydrate on mount / attemptId change.
  useEffect(() => {
    if (!attemptId) return;
    if (fetchedForRef.current === attemptId) return;
    fetchedForRef.current = attemptId;
    const cancelledRef = { current: false };
    fetchPack(cancelledRef);
    return () => {
      cancelledRef.current = true;
    };
  }, [attemptId, fetchPack]);

  // Reset the zustand store when the component unmounts.
  useEffect(() => {
    return () => {
      reset();
    };
  }, [reset]);

  const current = useMemo(
    () => selectCurrentQuestion(viewModel, currentIndex),
    [viewModel, currentIndex]
  );

  const sectionDurationSec = useMemo(() => {
    if (!current || !viewModel) return 0;
    const sec = viewModel.sections.find((s) => s.kind === current.sectionKind);
    return sec?.durationSec ?? 0;
  }, [current, viewModel]);

  const elapsedThisSection = current ? elapsedSecPerSection[current.sectionKind] : 0;
  const remainingSec = Math.max(0, sectionDurationSec - elapsedThisSection);

  // Soft-clock — pauses on submit error or while submitting/loading.
  useEffect(() => {
    if (!current || !viewModel) return;
    if (submitError !== null) return;
    if (status === "submitting" || status === "loading") return;
    const id = setInterval(() => {
      const cur = useDiagnosticAttemptStore.getState();
      if (!cur.viewModel) return;
      const q = cur.viewModel.questions[cur.currentIndex];
      if (!q) return;
      const next = (cur.elapsedSecPerSection[q.sectionKind] ?? 0) + 1;
      cur.setElapsed(q.sectionKind, next);
    }, TIMER_TICK_MS);
    return () => clearInterval(id);
  }, [current, viewModel, submitError, status]);

  const handleBack = (): void => {
    router.back();
  };

  const submitAndAdvance = useCallback(
    async (finalAnswers: Readonly<Record<string, string>>): Promise<void> => {
      setStatus("submitting");
      setSubmitError(null);
      try {
        const result = await submitDiagnostic({
          attemptId,
          answers: finalAnswers,
          clientMeta: { elapsedSecPerSection },
        });
        setResult(result);
        setFailedAttempts(0);
        router.push(`/${locale}/app/onboarding/result?attempt=${attemptId}&mode=${mode}`);
      } catch (err) {
        const code = err instanceof Error && err.message ? err.message : "diagnostic_submit_failed";
        setSubmitError(code);
        setFailedAttempts((prev) => prev + 1);
        setStatus("in_progress", code);
      }
    },
    [attemptId, mode, router, locale, elapsedSecPerSection, setResult, setStatus]
  );

  const handleFinishLater = useCallback((): void => {
    if (mode === "retake") {
      router.back();
      return;
    }
    router.push(`/${locale}/app/onboarding/motivation`);
  }, [router, locale, mode]);

  const canSkip = failedAttempts >= RETRIES_BEFORE_SKIP;

  const handleValidate = (): void => {
    if (!current || selected === null) return;
    if (status === "submitting") return;
    const nextAnswers = { ...answers, [current.questionId]: selected };
    recordAnswer(current.questionId, selected);
    if (viewModel !== null && currentIndex + 1 >= viewModel.questions.length) {
      trackEvent("onboarding_step_completed", { step: "diagnostic", index: currentIndex + 1 });
      void submitAndAdvance(nextAnswers);
      return;
    }
    advance();
    setSelected(null);
  };

  const handleRetryLoad = (): void => {
    setLoadError(null);
    fetchPack({ current: false });
  };

  if (status === "loading" || (status === "idle" && attemptId && loadError === null)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <AppText tone="secondary" size="body">
          {t("onboarding:diagnostic.loading")}
        </AppText>
      </div>
    );
  }

  if (loadError !== null || !current || !viewModel) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <AppText tone="warning" size="body" testID="onboarding-diagnostic-load-error">
          {t("onboarding:diagnostic.loadError")}
        </AppText>
        <AppButton
          label={t("onboarding:diagnostic.retryCta")}
          onClick={handleRetryLoad}
          variant="premium"
          testID="onboarding-diagnostic-retry"
        />
      </div>
    );
  }

  const sectionLabel = t(`onboarding:diagnostic.section.${current.sectionKind}`).toUpperCase();

  return (
    <div className="flex min-h-screen flex-col gap-4" data-testid="onboarding-diagnostic-screen">
      <div className="flex items-center justify-between">
        <button
          type="button"
          data-testid="onboarding-diagnostic-back"
          aria-label={t("common:actions.back")}
          onClick={handleBack}
          className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] bg-bg-card"
        >
          <AppText tone="primary" size="h3" weight="regular" aria-hidden="true">
            {"←"}
          </AppText>
        </button>
        <div className="flex flex-1 items-center justify-center">
          <AppText
            tone="tertiary"
            size="caption"
            weight="semi"
            numeric
            className="tracking-wide uppercase"
            testID="onboarding-diagnostic-eyebrow"
          >
            {sectionLabel} · {current.sectionIndex}/{current.sectionTotal} ·{" "}
            {formatClock(remainingSec)}
          </AppText>
        </div>
        <div className="w-11" aria-hidden="true" />
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto pb-4">
        <div className="mt-2 flex flex-col gap-2">
          <AppText
            tone="primary"
            size="h2"
            weight="semi"
            family="serif"
            as="h1"
            testID="onboarding-diagnostic-title"
          >
            {t(`onboarding:diagnostic.section.${current.sectionKind}`)}
          </AppText>
          <div className="h-[3px] w-14 rounded-[var(--radius-full)] bg-cta" aria-hidden="true" />
        </div>

        <Chip
          label={current.categoryPillLabel}
          className="self-start"
          testID="onboarding-diagnostic-category"
        />

        {current.readingText !== null ? (
          <div
            className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-line-soft bg-bg-card p-4"
            data-testid="onboarding-diagnostic-reading"
          >
            {current.readingText.title_de !== null && current.readingText.title_de.length > 0 ? (
              <AppText tone="primary" size="bodyLg" weight="semi" family="serif">
                {current.readingText.title_de}
              </AppText>
            ) : null}
            <AppText tone="secondary" size="body">
              {current.readingText.body_de}
            </AppText>
          </div>
        ) : null}

        <AppText
          tone="primary"
          size="h3"
          weight="semi"
          family="serif"
          className="mt-2"
          testID="onboarding-diagnostic-question"
        >
          {current.stemDe}
        </AppText>

        <div className="mt-2 flex flex-col gap-2">
          {current.options.map((opt) => {
            const isSelected = selected === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                role="radio"
                aria-checked={isSelected}
                aria-label={opt.label_de}
                onClick={() => setSelected(opt.key)}
                data-testid={`onboarding-diagnostic-option-${opt.key}`}
                className={clsx(
                  "flex min-h-14 items-center gap-4 rounded-[var(--radius-full)] border px-4 py-2 text-left",
                  "transition hover:opacity-90",
                  isSelected ? "border-bg-premium bg-bg-premium" : "border-line-strong bg-bg-card"
                )}
              >
                <span
                  data-testid={`onboarding-diagnostic-option-${opt.key}-radio`}
                  className={clsx(
                    "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2",
                    isSelected ? "border-cta bg-bg-premium" : "border-line-strong bg-bg-card"
                  )}
                >
                  {isSelected ? <span className="h-[10px] w-[10px] rounded-full bg-cta" /> : null}
                </span>
                <span className="flex-1">
                  <AppText
                    tone={isSelected ? "inverse" : "primary"}
                    size="body"
                    weight={isSelected ? "semi" : "regular"}
                    surface={isSelected ? "premium" : "card"}
                  >
                    {opt.label_de}
                  </AppText>
                </span>
              </button>
            );
          })}
        </div>

        <AppText tone="tertiary" size="small" className="mt-2" testID="onboarding-diagnostic-note">
          {t("onboarding:diagnostic.note")}
        </AppText>

        {submitError !== null ? (
          <AppText
            tone="warning"
            size="small"
            className="mt-2"
            testID="onboarding-diagnostic-error"
          >
            {t("onboarding:diagnostic.submitError")}
          </AppText>
        ) : null}
      </div>

      <AppButton
        label={
          submitError !== null
            ? t("onboarding:diagnostic.retryCta")
            : t("onboarding:diagnostic.cta")
        }
        onClick={handleValidate}
        variant="premium"
        disabled={selected === null}
        loading={status === "submitting"}
        testID="onboarding-diagnostic-cta"
      />
      {canSkip ? (
        <AppButton
          label={t("onboarding:diagnostic.skipCta")}
          onClick={handleFinishLater}
          variant="ghost"
          testID="onboarding-diagnostic-skip"
          className="mt-2"
        />
      ) : null}
    </div>
  );
}
