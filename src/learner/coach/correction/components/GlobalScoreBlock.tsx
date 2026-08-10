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
 */
import { useTranslation } from "react-i18next";
import clsx from "clsx";

import { scoreToBand, type Band } from "@/learner/core/feedback/feedbackV2";
import { AppText } from "@/learner/ui/primitives";

export interface GlobalScoreBlockProps {
  readonly score: number;
  readonly summary: string;
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

export function GlobalScoreBlock({ score, summary }: GlobalScoreBlockProps) {
  const { t } = useTranslation(["coach"]);
  const band = scoreToBand(score);
  const style = BAND_STYLES[band];

  return (
    <div
      className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-line-soft bg-bg-card p-4"
      data-testid="correction-global-score"
    >
      <AppText tone="secondary" size="small">
        {t("coach:correction.walkthrough.scoreLabel")}
      </AppText>

      <div className="flex items-center gap-2">
        <AppText as="span" family="serif" size="display" weight="bold" tone="primary" numeric>
          {score}
        </AppText>
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
