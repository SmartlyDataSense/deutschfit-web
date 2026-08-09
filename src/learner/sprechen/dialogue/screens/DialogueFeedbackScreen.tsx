"use client";

/**
 * `DialogueFeedbackScreen` — graded paired-Sprechen ("dialogue") practice
 * result (S7 · Task 7.11). Web port of `deutschfit-mobile/src/features/
 * sprechen/dialogue/screens/DialogueFeedbackScreen.tsx` (357L) — read fully
 * before touching this file.
 *
 * Layout (mirrors `SprechenFeedbackScreen`):
 *   - Serif heading: "Résultat de préparation (non officiel)".
 *   - `BandPill` (solide / proche_du_seuil / a_retravailler).
 *   - Practice score line — the ONLY number rendered (server-authoritative
 *     `overallScore`; per-criterion scores are never shown as a telc
 *     sub-score — telc reports module scores only, and the wire carries no
 *     weights, so no faithful aggregate is possible).
 *   - Summary prose.
 *   - "Vu par le Prüfer" examiner card — holistic prose + deduped criteria
 *     (`groupDimensions` — grouped by `nativeLabel`, inert
 *     empty-justification entries dropped, surviving justifications merged;
 *     at telc B1 three board-blind keys collapse onto the same
 *     `nativeLabel`, "Formale Richtigkeit").
 *   - "Côté Betreuer" companion card — faceless in-app persona.
 *   - Footer: "Refaire l'exercice" (retake) / "Terminer" (done).
 *
 * P11 (binding): reads the non-persisted `useDialogueResult` store
 * (`../resultStore`) directly — no props, no route param. A cold `null`
 * (hard refresh, deep link straight onto this route, or the store already
 * cleared) redirects to the Teil picker instead of attempting a second,
 * non-idempotent `finalizeDialogue` call. Retake/done both clear the store
 * before navigating away so a stale result can never resurrect.
 *
 * Web delta — no `LiquidGlassTopBar` / `FooterDock` (mobile-only chrome);
 * footer CTAs render inline at the bottom of the page content, same idiom
 * `SprechenFeedbackScreen` established.
 */
import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useTranslation } from "react-i18next";
import clsx from "clsx";

import { AppButton, AppText, Card } from "@/learner/ui/primitives";

import type { DialogueDimension, DialogueResult } from "@/learner/core/api/examApi";

import { useDialogueResult } from "../resultStore";

// ---------------------------------------------------------------------------
// Dimension grouping — B1 native-label collapse (verbatim port of mobile's
// `groupDimensions`).
// ---------------------------------------------------------------------------

interface DisplayCriterion {
  readonly nativeLabel: string;
  readonly justifications: string[];
}

/**
 * Group grader dimensions for display by `nativeLabel`.
 *
 * At telc B1, three board-blind keys (wortschatz / grammatik / aussprache)
 * collapse onto the SAME `nativeLabel` ("Formale Richtigkeit"), and the
 * aussprache entry is inert (weight 0, empty `justificationFr`). Inert
 * entries are dropped; the surviving justifications of a collapsed group
 * are merged into one row. At B2 every entry has a distinct `nativeLabel`,
 * so each survives as its own row.
 *
 * Keyed by `nativeLabel` via a `Map` so grouping is O(n); `Map` iteration
 * preserves insertion order, so display order follows the grader's
 * dimension order.
 */
function groupDimensions(dimensions: readonly DialogueDimension[]): DisplayCriterion[] {
  const byLabel = new Map<string, DisplayCriterion>();
  for (const dim of dimensions) {
    const justification = dim.justificationFr.trim();
    if (justification.length === 0) continue; // drop inert entries (e.g. B1 aussprache)
    const existing = byLabel.get(dim.nativeLabel);
    if (existing) {
      if (!existing.justifications.includes(justification)) {
        existing.justifications.push(justification);
      }
    } else {
      byLabel.set(dim.nativeLabel, {
        nativeLabel: dim.nativeLabel,
        justifications: [justification],
      });
    }
  }
  return Array.from(byLabel.values());
}

// ---------------------------------------------------------------------------
// Band pill — local component, same substitution `SprechenFeedbackScreen`
// uses (no "error" `AppText` tone; `a_retravailler` reuses "warning" text
// paired with the error-tinted background).
// ---------------------------------------------------------------------------

type Band = DialogueResult["band"];

interface BandStyle {
  readonly bg: string;
  readonly tone: "success" | "warning";
}

const BAND_STYLES: Record<Band, BandStyle> = {
  solide: { bg: "bg-success-subtle", tone: "success" },
  proche_du_seuil: { bg: "bg-warning-subtle", tone: "warning" },
  a_retravailler: { bg: "bg-error-subtle", tone: "warning" },
};

interface BandPillProps {
  readonly band: Band;
  readonly label: string;
  readonly testID?: string;
}

function BandPill({ band, label, testID }: BandPillProps) {
  const style = BAND_STYLES[band];
  return (
    <div data-testid={testID} className={clsx("rounded-[var(--radius-full)] px-4 py-1", style.bg)}>
      <AppText tone={style.tone} size="caption" weight="semi" className="uppercase tracking-wide">
        {label}
      </AppText>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Criterion row — label + merged justifications, NO numeric score.
// ---------------------------------------------------------------------------

interface CriterionRowProps {
  readonly criterion: DisplayCriterion;
  readonly testID?: string;
}

function CriterionRow({ criterion, testID }: CriterionRowProps) {
  return (
    <div data-testid={testID} className="flex flex-col gap-1 border-t border-line-soft py-2">
      <AppText
        family="sans"
        size="caption"
        weight="semi"
        tone="tertiary"
        className="uppercase tracking-wide"
      >
        {criterion.nativeLabel}
      </AppText>
      {criterion.justifications.map((justification) => (
        <AppText key={justification} family="sans" size="small" tone="secondary">
          {justification}
        </AppText>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function DialogueFeedbackScreen() {
  const router = useRouter();
  const locale = useLocale();
  const { t } = useTranslation("sprechen");
  const result = useDialogueResult((s) => s.result);

  // P11 — a cold `null` (hard refresh / deep link / already-cleared store)
  // sends the learner back to the Teil picker instead of attempting a
  // second, non-idempotent `finalizeDialogue` call.
  useEffect(() => {
    if (result === null) {
      router.replace(`/${locale}/app/sprechen/dialogue`);
    }
  }, [result, router, locale]);

  const handleRetake = useCallback(() => {
    useDialogueResult.getState().clear();
    router.replace(`/${locale}/app/sprechen/dialogue`);
  }, [router, locale]);

  const handleDone = useCallback(() => {
    useDialogueResult.getState().clear();
    router.replace(`/${locale}/app`);
  }, [router, locale]);

  if (result === null) return null;

  const criteria = groupDimensions(result.dimensions);

  return (
    <div
      data-testid="dialogue-feedback-screen"
      className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6 lg:px-8"
    >
      <div data-testid="dialogue-feedback-graded" className="flex flex-col gap-4">
        <AppText as="h1" family="serif" size="h2" weight="bold" tone="primary">
          {t("feedbackScreen.dialogue.heading")}
        </AppText>

        <div className="flex flex-wrap items-center gap-2">
          <BandPill
            band={result.band}
            label={t(`feedbackScreen.band.${result.band}`)}
            testID="dialogue-feedback-band"
          />
        </div>

        <AppText
          family="sans"
          size="body"
          weight="semi"
          tone="primary"
          numeric
          testID="dialogue-feedback-practice-score"
        >
          {t("feedbackScreen.dialogue.practiceScore", { score: result.overallScore })}
        </AppText>

        <AppText family="sans" size="body" tone="secondary">
          {result.summaryFr}
        </AppText>

        <Card
          elevated
          padded
          testID="dialogue-feedback-examiner-card"
          className="flex flex-col gap-2"
        >
          <AppText as="h2" family="serif" size="h3" weight="bold" tone="primary">
            {t("feedbackScreen.examiner.title")}
          </AppText>
          <AppText family="sans" size="body" tone="secondary">
            {result.prueferText}
          </AppText>
          {criteria.map((criterion, index) => (
            <CriterionRow
              key={criterion.nativeLabel}
              criterion={criterion}
              testID={`dialogue-feedback-criterion-${index}`}
            />
          ))}
        </Card>

        <Card
          elevated
          padded
          testID="dialogue-feedback-betreuer-card"
          className="flex flex-col gap-2"
        >
          <AppText as="h2" family="serif" size="h3" weight="bold" tone="primary">
            {t("feedbackScreen.betreuer.title")}
          </AppText>
          <AppText family="sans" size="body" tone="secondary">
            {result.betreuerText}
          </AppText>
        </Card>

        <div className="mt-2 flex flex-col gap-3 border-t border-line-subtle pt-4 sm:flex-row">
          <AppButton
            testID="dialogue-feedback-retake"
            label={t("feedbackScreen.retake")}
            onClick={handleRetake}
            className="flex-1"
          />
          <AppButton
            testID="dialogue-feedback-done"
            label={t("feedbackScreen.backToHome")}
            onClick={handleDone}
            variant="outline"
            className="flex-1"
          />
        </div>
      </div>
    </div>
  );
}
