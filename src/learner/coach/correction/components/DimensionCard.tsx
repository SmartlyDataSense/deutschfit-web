"use client";

/**
 * `DimensionCard` — one per grading dimension: name, blurb, score, grader
 * justification, and a drill CTA (S9 · Task 9.9). Web port of
 * `deutschfit-mobile/src/features/coach/correction/components/DimensionCard.tsx`.
 * Used by both Schreiben and Sprechen correction-walkthrough layouts.
 *
 * `data-testid` is derived from `dimensionKey` (`correction-dimension-
 * {key}`) rather than an explicit `testID` prop — `dimensionKey` is
 * guaranteed unique per render within a single walkthrough screen (5
 * sprechen dims / 4 schreiben dims, each rendered exactly once), so this
 * self-derived id already satisfies the "explicit testID per instance"
 * rule (task-9.9-brief.md TEST DISCIPLINE / #S9 Task 9.4 lesson) without
 * needing a separate prop the brief's `Produces` contract doesn't list.
 *
 * IMPORTANT — the CTA is rendered but INERT. `onDrill` is wired to a
 * no-op by `CorrectionWalkthroughScreen` (parity with mobile #416):
 * `CoachDrillChain` needs a server-generated `{threadId, observationId,
 * connectors, drills}` payload the read-only walkthrough does not carry.
 * Do not wire this CTA up — see the walkthrough screen's file header for
 * the full rationale.
 */
import { useTranslation } from "react-i18next";

import { Icon } from "@/learner/core/icons";
import { AppText } from "@/learner/ui/primitives";

export type WalkthroughDimensionKey =
  | "aufgabe"
  | "kohaerenz"
  | "wortschatz"
  | "grammatik"
  | "aussprache"
  | "erfuellung"
  | "strukturen";

export interface DimensionCardProps {
  readonly dimensionKey: WalkthroughDimensionKey;
  readonly score: number;
  readonly justification: string;
  readonly onDrill: () => void;
}

export function DimensionCard({ dimensionKey, score, justification, onDrill }: DimensionCardProps) {
  const { t } = useTranslation(["coach"]);

  const dimensionName = t(`coach:correction.dimensions.${dimensionKey}.name`);
  const blurb = t(`coach:correction.dimensions.${dimensionKey}.blurb`);
  const scoreLabel = t("coach:correction.walkthrough.dimensionScoreLabel", { score });
  const drillCta = t("coach:correction.walkthrough.drillCta");
  const drillA11y = t("coach:correction.walkthrough.drillCtaA11y", { dimension: dimensionName });

  return (
    <div
      className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-line-soft bg-bg-card p-4"
      data-testid={`correction-dimension-${dimensionKey}`}
    >
      <div className="flex items-center justify-between gap-2">
        <AppText tone="primary" size="bodyLg" weight="semi" className="flex-1 truncate">
          {dimensionName}
        </AppText>
        <AppText tone="coach" size="bodyLg" weight="semi">
          {scoreLabel}
        </AppText>
      </div>

      <AppText tone="secondary" size="small">
        {blurb}
      </AppText>

      {justification.length > 0 ? (
        <AppText tone="primary" size="body">
          {justification}
        </AppText>
      ) : null}

      {/*
       * Drill CTA is rendered but INERT — deliberate parity with mobile
       * gap #416. `onClick={onDrill}` mirrors mobile's `onPress={onDrill}`
       * exactly; the no-op-ness lives in the CALLER (the walkthrough
       * screen passes a no-op `onDrill`), not here. Do not wire this up
       * to a real drill-chain launch.
       */}
      <button
        type="button"
        aria-label={drillA11y}
        onClick={onDrill}
        data-testid={`correction-drill-cta-${dimensionKey}`}
        className="mt-1 flex items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-coach-subtle px-4 py-2 text-coach transition hover:opacity-90"
      >
        <AppText tone="coach" size="small" weight="semi">
          {drillCta}
        </AppText>
        <Icon name="chevron" size={16} />
      </button>
    </div>
  );
}
