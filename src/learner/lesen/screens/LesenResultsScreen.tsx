"use client";

/**
 * `LesenResultsScreen` — graded Lesen results (Task 4.9). Web port of
 * `deutschfit-mobile/src/features/lesen/screens/LesenResultsScreen.tsx`.
 *
 * Reads `useLesenResultsStore` (P7 — Next.js query strings can't carry a
 * `SessionScore` object, so `LesenSessionScreen` writes this in-memory
 * store immediately before `router.push`). An empty store — a hard
 * refresh or a direct deep-link onto `/results` — has nothing to render,
 * so this screen bounces back to the Lesen intro route.
 *
 * All chrome is French i18n (`apprendre:practice.results.*`); "Lesen" /
 * "Teil" stay as board-native German labels, same split every Examen
 * screen uses. The corrections CTA is a no-op link to `/{locale}/app/examen`
 * per master-plan P2 — web has no `LesenReview` screen yet.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useTranslation } from "react-i18next";

import { AppButton, AppText, Card } from "@/learner/ui/primitives";
import { DisclaimerBanner } from "@/learner/ui/chrome/DisclaimerBanner";

import { useLesenResultsStore } from "../resultsStore";

const MODULE_LABEL = "Lesen";

export function LesenResultsScreen() {
  const router = useRouter();
  const locale = useLocale();
  const { t } = useTranslation(["apprendre"]);
  const payload = useLesenResultsStore((s) => s.payload);

  useEffect(() => {
    if (!payload) {
      router.replace(`/${locale}/app/examen/lesen`);
    }
  }, [payload, locale, router]);

  if (!payload) {
    return null;
  }

  const { score, submissionId, attemptId } = payload;
  const pct = Math.round(score.accuracy * 100);
  const eyebrow = t("apprendre:practice.results.eyebrow", { module: MODULE_LABEL });

  return (
    <div
      className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 lg:px-8"
      data-testid="lesen-results-screen"
    >
      <AppText tone="secondary" size="small" weight="medium" className="uppercase tracking-wide">
        {eyebrow}
      </AppText>

      <Card className="flex flex-col gap-4">
        <AppText as="h1" family="serif" size="h2" weight="bold">
          {t("apprendre:practice.results.headline", { correct: score.correct, total: score.total })}
        </AppText>
        <AppText tone="secondary" size="body">
          {t("apprendre:practice.results.percentCorrect", { pct })}
        </AppText>

        <div className="flex gap-4">
          <div className="flex-1">
            <AppText tone="secondary" size="small">
              {t("apprendre:practice.results.answered")}
            </AppText>
            <AppText size="h3" weight="semi" numeric>
              {score.answered}
            </AppText>
          </div>
          <div className="flex-1">
            <AppText tone="secondary" size="small">
              {t("apprendre:practice.results.unanswered")}
            </AppText>
            <AppText size="h3" weight="semi" numeric>
              {score.unanswered}
            </AppText>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Card className="flex flex-col gap-1">
          <AppText tone="secondary" size="small">
            {t("apprendre:practice.results.correct")}
          </AppText>
          <AppText size="h2" weight="bold" numeric>
            {score.correct}
          </AppText>
          <AppText tone="tertiary" size="caption">
            {t("apprendre:practice.results.correctHelper", { total: score.total })}
          </AppText>
        </Card>
        <Card className="flex flex-col gap-1">
          <AppText tone="secondary" size="small">
            {t("apprendre:practice.results.accuracy")}
          </AppText>
          <AppText size="h2" weight="bold" numeric>
            {`${pct}%`}
          </AppText>
          <AppText tone="tertiary" size="caption">
            {t("apprendre:practice.results.accuracyHelper")}
          </AppText>
        </Card>
      </div>

      <div className="flex flex-col gap-2">
        <AppText as="h2" size="h3" weight="semi">
          {t("apprendre:practice.results.perTeil")}
        </AppText>
        <div
          className="flex flex-col rounded-[var(--radius-lg)] border border-line-soft px-4"
          aria-label={t("apprendre:practice.results.perTeil")}
        >
          {score.parts.map((part, idx) => (
            <div
              key={part.partId}
              className={
                idx === 0
                  ? "flex items-center justify-between py-3"
                  : "flex items-center justify-between border-t border-line-soft py-3"
              }
            >
              <AppText size="body" weight="semi">
                {part.label}
              </AppText>
              <AppText tone="secondary" size="body" family="mono" numeric>
                {`${part.correct} / ${part.total}`}
              </AppText>
            </div>
          ))}
        </div>
      </div>

      <AppText tone="tertiary" size="small" family="mono" className="truncate">
        {`${t("apprendre:practice.results.submission")} · ${submissionId}`}
      </AppText>

      <DisclaimerBanner compact />

      <div className="flex flex-col gap-2">
        {attemptId ? (
          <AppButton
            testID="lesen-results-view-corrections"
            label={t("apprendre:practice.results.viewCorrections")}
            variant="outline"
            onClick={() => router.push(`/${locale}/app/examen`)}
          />
        ) : null}
        <AppButton
          testID="lesen-results-back"
          label={t("apprendre:practice.results.back")}
          onClick={() => router.push(`/${locale}/app/examen/lesen`)}
        />
      </div>
    </div>
  );
}
