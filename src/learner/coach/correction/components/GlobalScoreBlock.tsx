"use client";

/**
 * `GlobalScoreBlock` — large numeric score, band chip, and one-line
 * summary (S9 · Task 9.9). Web port of
 * `deutschfit-mobile/src/features/coach/correction/components/GlobalScoreBlock.tsx`.
 * Used by both Schreiben and Sprechen correction-walkthrough layouts.
 *
 * Web delta: `AppText` has no "error" tone. Follows the established
 * precedent (`SprechenFeedbackScreen`'s `BAND_STYLES`,
 * `DialogueFeedbackScreen`'s `BAND_STYLES`) — `a_retravailler` reuses the
 * "warning" text tone paired with the error-tinted background.
 *
 * Fix round (issue #41 defect 2): `score` is not guaranteed to already be a
 * 0-100 percentage — the Schreiben caller passes RAW POINTS (e.g. 38 out of
 * a telc-B1 `scoreMax` of 45). Feeding raw points straight into
 * `scoreToBand` (which assumes a 0-100 scale) mislabels a genuine 84% pass
 * as "à retravailler". `scorePercent` below derives the percentage the band
 * is actually computed from; `scoreMax`/`normalizedTotalPct` are optional
 * so the Sprechen caller (whose `overall_score` already IS a 0-100
 * percentage, per `feedbackV2.ts`'s `BAND_THRESHOLDS`) is unaffected —
 * it passes neither, and `scorePercent` falls through to `score` unchanged,
 * exactly as before this fix.
 */
import { useTranslation } from "react-i18next";
import clsx from "clsx";

import { scoreToBand, type Band } from "@/learner/core/feedback/feedbackV2";
import { AppText } from "@/learner/ui/primitives";

export interface GlobalScoreBlockProps {
  readonly score: number;
  readonly summary: string;
  /**
   * Board-native points denominator (migration 0119: Goethe-B1 → 100,
   * telc-B1/B2 → 45, …). When present, the header renders `score /
   * scoreMax` (mirrors `ScoreHeaderCard`'s `"score / scoreMax unit"`
   * convention) instead of a bare `score`, and doubles as the band
   * fallback when `normalizedTotalPct` is absent. Omit for Sprechen, whose
   * `score` has no board-native denominator.
   */
  readonly scoreMax?: number | null;
  /**
   * Server-derived overall percentage (0-100). Preferred band-derivation
   * input over `score / scoreMax` when present — stays correct under
   * non-uniform rubric weighting. Omit for Sprechen.
   */
  readonly normalizedTotalPct?: number | null;
}

interface BandStyle {
  readonly bg: string;
  readonly tone: "success" | "warning";
}

const BAND_STYLES: Record<Band, BandStyle> = {
  solide: { bg: "bg-success-subtle", tone: "success" },
  proche_du_seuil: { bg: "bg-warning-subtle", tone: "warning" },
  a_retravailler: { bg: "bg-error-subtle", tone: "warning" },
};

/**
 * Derive the 0-100 percentage `scoreToBand` expects.
 *
 * Precedence: `normalizedTotalPct` (server-computed, correct under
 * non-uniform weighting) > `score / scoreMax * 100` (board-native points)
 * > `score` unchanged.
 *
 * The final fallback is a DELIBERATE, DOCUMENTED choice, not a silent
 * `/ 100`: callers that pass neither `scoreMax` nor `normalizedTotalPct`
 * are declaring — by omission — that `score` is already a 0-100 value.
 * That is true for both known callers today: Sprechen's
 * `FeedbackV2.overall_score` (always 0-100, see `feedbackV2.ts`), and any
 * legacy Schreiben row that predates migration 0119's `score_max` column
 * (those rows' raw `score` was always Goethe's own /100, the only board
 * live before telc shipped). A future board with neither a numeric
 * denominator NOR a server percentage would need a new signal — this
 * function has no way to guess one, and must not silently assume `/ 100`
 * for it.
 */
function scorePercent(
  score: number,
  scoreMax: number | null | undefined,
  normalizedTotalPct: number | null | undefined
): number {
  if (typeof normalizedTotalPct === "number" && Number.isFinite(normalizedTotalPct)) {
    return normalizedTotalPct;
  }
  if (typeof scoreMax === "number" && Number.isFinite(scoreMax) && scoreMax > 0) {
    return (score / scoreMax) * 100;
  }
  return score;
}

export function GlobalScoreBlock({
  score,
  summary,
  scoreMax,
  normalizedTotalPct,
}: GlobalScoreBlockProps) {
  const { t } = useTranslation(["coach"]);
  const band = scoreToBand(scorePercent(score, scoreMax, normalizedTotalPct));
  const style = BAND_STYLES[band];
  const hasScoreMax = typeof scoreMax === "number" && Number.isFinite(scoreMax) && scoreMax > 0;

  return (
    <div
      className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-line-soft bg-bg-card p-4"
      data-testid="correction-global-score"
    >
      <AppText tone="secondary" size="small">
        {t("coach:correction.walkthrough.scoreLabel")}
      </AppText>

      <div className="flex items-center gap-2">
        <div className="flex items-baseline gap-1">
          <AppText as="span" family="serif" size="display" weight="bold" tone="primary" numeric>
            {score}
          </AppText>
          {hasScoreMax ? (
            <AppText as="span" tone="secondary" size="h3" weight="semi" numeric>
              {`/ ${scoreMax}`}
            </AppText>
          ) : null}
        </div>
        <div
          data-testid={`correction-band-${band}`}
          className={clsx("rounded-[var(--radius-full)] px-3 py-1", style.bg)}
        >
          <AppText tone={style.tone} size="caption" weight="semi">
            {t(`coach:correction.walkthrough.bands.${band}`)}
          </AppText>
        </div>
      </div>

      {summary.length > 0 ? (
        <AppText tone="secondary" size="body">
          {summary}
        </AppText>
      ) : null}
    </div>
  );
}
