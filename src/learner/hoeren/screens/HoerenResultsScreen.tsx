"use client";

/**
 * `HoerenResultsScreen` — Hören results (S5 · Task 5.8). Web port of
 * `deutschfit-mobile/src/features/hoeren/screens/HoerenResultsScreen.tsx`.
 *
 * Reads `useHoerenResultsStore` (P7-style hand-off, same as
 * `LesenResultsScreen`'s `useLesenResultsStore` — Next.js query strings
 * can't carry a `SessionScore` object, so `HoerenSessionScreen` writes this
 * in-memory store immediately before `router.push`). An empty store — a
 * hard refresh or a direct deep-link onto `/results` — has nothing to
 * render, so this screen bounces back to the Apprendre practice hub
 * (unlike Lesen, which only has a graded route today, Hören's results
 * route is shared between the practice and graded flows — P9 — so the
 * empty-store redirect always lands on the practice hub, the safer of the
 * two entry points regardless of which mode would have produced the
 * missing payload).
 *
 * Content set is mobile's exact `HoerenResultsScreen` verbatim: eyebrow,
 * headline (`{correct}/{total}`), a bare `{pct}%` (not the `percentCorrect`
 * sentence `LesenResultsScreen` layers on top — mobile has no such
 * sentence, and mobile wins on this member), answered/unanswered counts,
 * per-Teil rows, and the submission id — no `correct`/`accuracy` grid
 * cards and no corrections CTA (mobile's Hören screen has neither). Idioms
 * (empty-store redirect-in-effect, no clear-on-leave, `DisclaimerBanner
 * compact`, primitives vocabulary) follow `LesenResultsScreen` (S4 · Task
 * 4.9) exactly — including its exact absence of any clear-on-unmount call;
 * the store is left populated until the next `.set()` overwrites it.
 *
 * Skills bars are new to this screen — neither mobile's Hören/Lesen
 * results screens nor `LesenResultsScreen` (web) render `payload.skills`
 * today, even though the Lesen session screen already writes it into the
 * store. This is the first consumer. Gated on `payload.skills` being a
 * non-empty array; each bar reuses the already-shipped
 * `apprendre:cards.<key>.title` labels (board-native German module names)
 * and the shared `ProgressBar` primitive.
 *
 * Back CTA target is mode-aware (P9, web-only — mobile has no `mode`
 * concept because it always returns to the single Hören stack): `practice`
 * → the Apprendre practice hub, `graded` → the Examen hub. Mirrors
 * `HoerenSessionScreen`'s own mode dispatch when it wrote this payload.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useTranslation } from "react-i18next";

import { AppButton, AppText, Card, ProgressBar } from "@/learner/ui/primitives";
import { DisclaimerBanner } from "@/learner/ui/chrome/DisclaimerBanner";

import { useHoerenResultsStore } from "../resultsStore";
import type { SkillScore } from "@/learner/lesen/resultsStore";

const MODULE_LABEL = "Hören";

function skillFraction(skill: SkillScore): number {
  if (skill.score === null || skill.max === null || skill.max <= 0) return 0;
  return skill.score / skill.max;
}

export function HoerenResultsScreen() {
  const router = useRouter();
  const locale = useLocale();
  const { t } = useTranslation(["apprendre"]);
  const payload = useHoerenResultsStore((s) => s.payload);

  useEffect(() => {
    if (!payload) {
      router.replace(`/${locale}/app/apprendre/practice`);
    }
  }, [payload, locale, router]);

  if (!payload) {
    return null;
  }

  const { score, submissionId, skills, mode } = payload;
  const pct = Math.round(score.accuracy * 100);
  const eyebrow = t("apprendre:practice.results.eyebrow", { module: MODULE_LABEL });
  const backHref =
    mode === "graded" ? `/${locale}/app/examen` : `/${locale}/app/apprendre/practice`;

  return (
    <div
      className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 lg:px-8"
      data-testid="hoeren-results-screen"
    >
      <AppText tone="secondary" size="small" weight="medium" className="uppercase tracking-wide">
        {eyebrow}
      </AppText>

      <Card className="flex flex-col gap-4">
        <AppText as="h1" family="serif" size="h2" weight="bold" testID="hoeren-results-headline">
          {t("apprendre:practice.results.headline", { correct: score.correct, total: score.total })}
        </AppText>
        <AppText family="serif" size="display" weight="bold" tone="gold" numeric>
          {`${pct}%`}
        </AppText>

        <div className="flex gap-4">
          <div className="flex-1">
            <AppText tone="secondary" size="small">
              {t("apprendre:practice.results.answered")}
            </AppText>
            <AppText size="h3" weight="semi" numeric>
              {`${score.answered} / ${score.total}`}
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

      {skills && skills.length > 0 ? (
        <div className="flex flex-col gap-2" data-testid="hoeren-results-skills">
          <AppText as="h2" size="h3" weight="semi">
            {t("apprendre:practice.results.skills")}
          </AppText>
          <Card className="flex flex-col gap-4">
            {skills.map((skill) => (
              <div key={skill.key} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <AppText size="body" weight="medium">
                    {t(`apprendre:cards.${skill.key}.title`)}
                  </AppText>
                  <AppText tone="secondary" size="small" family="mono" numeric>
                    {skill.score !== null && skill.max !== null
                      ? `${skill.score} / ${skill.max}`
                      : "—"}
                  </AppText>
                </div>
                <ProgressBar
                  value={skillFraction(skill)}
                  tone="gold"
                  aria-label={t(`apprendre:cards.${skill.key}.title`)}
                />
              </div>
            ))}
          </Card>
        </div>
      ) : null}

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
              data-testid={`hoeren-results-teil-${part.teilNumber}`}
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

      <AppButton
        testID="hoeren-results-back"
        label={t("apprendre:practice.results.back")}
        onClick={() => router.push(backHref)}
      />
    </div>
  );
}
