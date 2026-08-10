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
 *
 * `dimensionKey` (issue #41 fix round): widened from a closed union of
 * board-specific keys to `string` — the Schreiben caller now derives keys
 * board-blind from `dimension_scores` (see `correctionApi.ts`), so a
 * fixed union would reject exactly the telc facets this fix exists to
 * render. `coach:correction.dimensions.${key}.*` is authored for every
 * known facet (Goethe's 4, Sprechen's 5, telc's 3); `i18n.exists` below
 * guards the case a future board's facet ships before its labels do, so
 * an unlabelled key degrades to a humanized version of itself rather than
 * a raw i18n key string or a blank card.
 *
 * `scoreMax` (issue #41 fix round 2) is a deliberate three-state prop, not
 * a plain `number | null`:
 *   - omitted (`undefined`) — the Sprechen caller's contract. Sprechen
 *     dimension scores are always a 0-100 value already (see
 *     `feedbackV2.ts`); this preserves the EXACT prior rendering
 *     (`coach:correction.walkthrough.dimensionScoreLabel`, "score / 100")
 *     for the one path this fix must not touch.
 *   - `null` — the Schreiben caller's "denominator unknown" case (row has
 *     no `dimension_scores_json[key].max` on the wire). Renders the bare
 *     score with NO denominator — never a fabricated "/ 100".
 *   - a `number` — the Schreiben caller's normal case: renders
 *     "score / scoreMax" in the board's own units (telc = "13 / 15").
 */
import { useTranslation } from "react-i18next";

import { Icon } from "@/learner/core/icons";
import { AppText } from "@/learner/ui/primitives";

export type WalkthroughDimensionKey = string;

export interface DimensionCardProps {
  readonly dimensionKey: WalkthroughDimensionKey;
  readonly score: number;
  readonly scoreMax?: number | null;
  readonly justification: string;
  readonly onDrill: () => void;
}

/**
 * Fallback display name for a dimension key with no authored
 * `coach:correction.dimensions.${key}.name` entry: `some_new_facet` ->
 * `Some New Facet`. Readable, not a raw snake_case key and not blank —
 * exactly what issue #41's "graceful fallback" requirement asks for.
 */
function humanizeDimensionKey(key: string): string {
  return key
    .split("_")
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function DimensionCard({
  dimensionKey,
  score,
  scoreMax,
  justification,
  onDrill,
}: DimensionCardProps) {
  const { t, i18n } = useTranslation(["coach"]);

  const hasLabel = i18n.exists(`coach:correction.dimensions.${dimensionKey}.name`);
  const dimensionName = hasLabel
    ? t(`coach:correction.dimensions.${dimensionKey}.name`)
    : humanizeDimensionKey(dimensionKey);
  const blurb = hasLabel ? t(`coach:correction.dimensions.${dimensionKey}.blurb`) : "";
  // Three-state `scoreMax` — see the file-header comment for the full
  // rationale (issue #41 fix round 2).
  const scoreLabel =
    scoreMax === undefined
      ? t("coach:correction.walkthrough.dimensionScoreLabel", { score })
      : scoreMax === null
        ? t("coach:correction.walkthrough.dimensionScoreNoMaxLabel", { score })
        : t("coach:correction.walkthrough.dimensionScoreWithMaxLabel", { score, scoreMax });
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

      {blurb.length > 0 ? (
        <AppText tone="secondary" size="small">
          {blurb}
        </AppText>
      ) : null}

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
