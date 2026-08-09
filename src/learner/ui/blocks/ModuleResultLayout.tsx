"use client";

import { useTranslation } from "react-i18next";

import { AppText, Donut } from "@/learner/ui/primitives";
import {
  DIMENSION_LABEL_FALLBACK,
  DIMENSION_LABEL_MAP,
} from "@/learner/core/types/dimensionLabels";
import type { DimensionScoresJson } from "@/learner/core/api/examApi";
import { resultTypeFromScoreMax } from "@/learner/core/api/resultType";

import { BetreuerCard } from "./BetreuerCard";
import { CompetenceBarRow } from "./CompetenceBarRow";
import { FocusChips } from "./FocusChips";
import { PersonalizedModelCard } from "./PersonalizedModelCard";
import { ScoreHeaderCard } from "./ScoreHeaderCard";

/**
 * `ModuleResultLayout` — unified result layout shared by Schreiben and
 * Sprechen feedback screens. Ports
 * `deutschfit-mobile/src/ui/blocks/ModuleResultLayout.tsx` — RN
 * `StyleSheet`/`View` become Tailwind-token markup, `testID` becomes
 * `data-testid`.
 *
 * Sections (all guard-rendered — safe with partial backend data):
 *   1. Headline — board-native `ScoreHeaderCard` (points profiles) XOR the
 *      donut — `sum(scores) / sum(maxScores)` as a teal+amber two-arc ring
 *      (band/legacy profiles).
 *   2. Rubric bars — one `CompetenceBarRow` per dimension, labelled from
 *      `DIMENSION_LABEL_MAP` so no magic strings live in screen code.
 *   3-4. Betreuer section + personalized model text — `BetreuerCard`/
 *      `FocusChips`/`PersonalizedModelCard` (S7 Task 7.5 — ported from
 *      mobile's `CoachCard`/`FocusChips`/`PersonalizedModelCard`;
 *      `CoachCard` renamed per Constraint 10, "Coach" is a forbidden
 *      in-app identifier). Render gates match mobile verbatim:
 *      `coachFeedbackFr` null → no `BetreuerCard`; `focusAreas` empty →
 *      no chips; `personalizedModelDe` null → no model card.
 *   5. Raw text — plain transcript card; shown only when `rawText` is set
 *      (Sprechen only; Schreiben omits this section).
 */
export type DimensionScoreEntry = {
  readonly key: string;
  readonly score: number;
  readonly maxScore: number;
  /**
   * Server-derived percentage (PR 3 wire shape): `round(100 * score / max)`.
   * When present the donut prefers it over the legacy sum/sum compute so the
   * board-blind rubric weighting stays authoritative.
   */
  readonly pct?: number;
};

/**
 * Normalize the on-wire `dimension_scores_json` (legacy flat or PR 3 nested)
 * into the view-shape consumed by `ModuleResultLayout`. Legacy flat-number
 * entries (pre-nested rows still in dev/preprod/prod) get a synthetic
 * `maxScore: 5`; PR 3 nested entries pass `score`/`max`/`pct` through
 * verbatim.
 */
export function dimensionScoresFromWire(
  wire: DimensionScoresJson | null | undefined
): DimensionScoreEntry[] {
  if (!wire) return [];
  return Object.entries(wire).map(([key, entry]) => {
    if (typeof entry === "number") {
      return { key, score: entry, maxScore: 5 };
    }
    return {
      key,
      score: entry.score,
      maxScore: entry.max,
      pct: entry.pct,
    };
  });
}

export type ModuleResultLayoutProps = {
  readonly dimensionScores: readonly DimensionScoreEntry[];
  readonly coachFeedbackFr: string | null;
  readonly nextDrillFr: string | null;
  readonly focusAreas: readonly string[];
  readonly personalizedModelDe: string | null;
  /** Plain transcript text. When set a raw-text card is rendered (Sprechen). */
  readonly rawText: string | null;
  /** Override the raw-text card section label. */
  readonly rawTextTitle?: string;
  /**
   * Server-derived overall percentage (PR 3 `normalized_total_pct`). When
   * present the donut renders this value rather than the legacy
   * `sum(score)/sum(max)` compute — keeps the headline figure board-blind
   * even on rubrics with non-uniform weighting.
   */
  readonly normalizedTotalPct?: number | null;
  /**
   * Board-native headline (migration 0119 wire shape). When `scoreMax` is a
   * positive number the layout is a *points* profile: it renders a
   * `ScoreHeaderCard` (`score / scoreMax` in the board's own nomenclature)
   * and suppresses the percentage donut. `score` is the backend's
   * authoritative module total — NEVER a client sum of `dimensionScores`,
   * which drifts under non-uniform weighting. Null/undefined `scoreMax`
   * (band profiles, legacy rows) keeps the donut path.
   */
  readonly score?: number | null;
  readonly scoreMax?: number | null;
  /** Official points floor (cert data). Renders the neutral objectif marker. */
  readonly passFloorPoints?: number | null;
  /** Unit noun after the fraction in the scorecard, e.g. "points". */
  readonly scoreUnitLabel?: string;
  /** Identifier eyebrow rendered at the top of the scorecard. */
  readonly eyebrow?: string | null;
  /** Neutral goal-reference label for the points floor, e.g. "Objectif". */
  readonly objectiveLabel?: string;
  readonly testID?: string;
};

function clamp01(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n > 1 ? 1 : n;
}

export function ModuleResultLayout({
  dimensionScores,
  coachFeedbackFr,
  nextDrillFr,
  focusAreas,
  personalizedModelDe,
  rawText,
  rawTextTitle,
  normalizedTotalPct,
  score,
  scoreMax,
  passFloorPoints,
  scoreUnitLabel = "points",
  eyebrow,
  objectiveLabel = "Objectif",
  testID = "module-result",
}: ModuleResultLayoutProps) {
  const { t } = useTranslation(["common"]);

  // Board-result dispatch: a *points* profile carries an authoritative
  // denominator (`scoreMax > 0`) and a server total (`score`) — render the
  // board-native scorecard and suppress the donut. Everything else (band
  // profiles, pre-0119 rows) keeps the percentage donut.
  const scoreNum = typeof score === "number" ? score : null;
  const scoreMaxNum = typeof scoreMax === "number" ? scoreMax : null;
  const showScorecard = resultTypeFromScoreMax(scoreMax) === "points" && scoreNum !== null;

  // Prefer the server-derived total when present (PR 3 wire shape); fall
  // back to the legacy sum/sum compute for pre-PR 3 rows that still ship a
  // flat dimension_scores_json without normalized_total_pct.
  const totalScore = dimensionScores.reduce((sum, d) => sum + d.score, 0);
  const totalMax = dimensionScores.reduce((sum, d) => sum + d.maxScore, 0);
  const fallbackFraction = totalMax > 0 ? clamp01(totalScore / totalMax) : 0;
  const scoredFraction =
    typeof normalizedTotalPct === "number" ? clamp01(normalizedTotalPct / 100) : fallbackFraction;
  const gapFraction = clamp01(1 - scoredFraction);
  const pct = Math.round(scoredFraction * 100);

  const txTitle = rawTextTitle ?? t("common:moduleResult.transcriptTitle");

  return (
    <div data-testid={testID} className="flex flex-col gap-4">
      {/* 1 — Headline: board-native scorecard (points) XOR donut (band) */}
      {showScorecard && scoreNum !== null && scoreMaxNum !== null ? (
        <ScoreHeaderCard
          testID={`${testID}-scorecard`}
          eyebrow={eyebrow}
          score={scoreNum}
          scoreMax={scoreMaxNum}
          unitLabel={scoreUnitLabel}
          passFloorPoints={passFloorPoints}
          objectiveLabel={objectiveLabel}
        />
      ) : dimensionScores.length > 0 ? (
        <div data-testid={`${testID}-donut-block`} className="flex flex-col items-center py-2">
          <Donut
            size={160}
            stroke={16}
            segments={[
              { value: scoredFraction, tone: "teal" },
              { value: gapFraction, tone: "amber" },
            ]}
            testID={`${testID}-donut`}
          >
            <AppText size="h1" family="serif" weight="bold" numeric>
              {`${pct}%`}
            </AppText>
          </Donut>
        </div>
      ) : null}

      {/* 2 — Rubric bars (rendered in both modes) */}
      {dimensionScores.length > 0 ? (
        <div
          data-testid={`${testID}-competences`}
          className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-line-soft bg-bg-card p-4"
        >
          <AppText
            size="caption"
            weight="semi"
            tone="secondary"
            className="tracking-wide uppercase"
          >
            {t("common:moduleResult.competencesTitle")}
          </AppText>
          {dimensionScores.map((d) => {
            const labels = DIMENSION_LABEL_MAP[d.key] ?? DIMENSION_LABEL_FALLBACK;
            const ratio =
              typeof d.pct === "number" ? d.pct / 100 : d.maxScore > 0 ? d.score / d.maxScore : 0;
            const tone = ratio >= 0.5 ? "teal" : "amber";
            return (
              <CompetenceBarRow
                key={d.key}
                testID={`${testID}-competence-${d.key}`}
                label={labels.labelGerman}
                italicSubtitle={labels.labelFrench}
                score={d.score}
                max={d.maxScore}
                tone={tone}
              />
            );
          })}
        </div>
      ) : null}

      {/* 3 — Betreuer section */}
      {coachFeedbackFr ? (
        <BetreuerCard
          testID={`${testID}-betreuer-card`}
          coachFeedbackFr={coachFeedbackFr}
          nextDrillFr={nextDrillFr}
        />
      ) : null}
      {focusAreas.length > 0 ? (
        <FocusChips testID={`${testID}-focus-chips`} areas={focusAreas} />
      ) : null}

      {/* 4 — Personalized model text */}
      <PersonalizedModelCard testID={`${testID}-personalized-model`} text={personalizedModelDe} />

      {/* 5 — Raw transcript (Sprechen only) */}
      {rawText ? (
        <div
          data-testid={`${testID}-transcript`}
          className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-line-soft bg-bg-card p-4"
        >
          <AppText
            size="caption"
            weight="semi"
            tone="secondary"
            className="tracking-wide uppercase"
          >
            {txTitle}
          </AppText>
          <AppText tone="secondary" size="body" className="leading-6">
            {rawText}
          </AppText>
        </div>
      ) : null}
    </div>
  );
}
