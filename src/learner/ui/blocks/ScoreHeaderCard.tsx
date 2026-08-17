import { AppText } from "@/learner/ui/primitives";

/**
 * `ScoreHeaderCard` block — board-native score headline for *points*
 * profiles. Ports `deutschfit-mobile/src/ui/blocks/ScoreHeaderCard.tsx`
 * verbatim semantics (props, math, testIDs) — RN `StyleSheet`/`View` become
 * Tailwind-token markup, `testID` becomes `data-testid`.
 *
 * Replaces the percentage donut on results / feedback screens for boards
 * that mark in points (telc, ÖSD, ECL, …). It speaks the board's own
 * nomenclature — "6 / 45 points" — because a raw fraction means more to a
 * learner than "13 %".
 *
 * Two invariants this block exists to guarantee:
 *
 *   1. **The headline binds to the backend's single authoritative total.**
 *      The caller passes `score` straight from the grader's module
 *      aggregate (board-native units, honoring weighted sums). This card
 *      NEVER re-sums the per-criterion dimensions — under non-uniform
 *      weighting a client sum drifts from the official total.
 *   2. **The fill and the objectif marker share one scale.** The teal
 *      track fills to `score / scoreMax` and the gold "objectif" marker
 *      sits at `passFloorPoints / scoreMax`. Same denominator → they align
 *      exactly, which is what the old donut failed to do.
 *
 * The "objectif" marker is a neutral *goal reference*, not a pass/fail
 * verdict. It renders only when the board publishes a numeric points floor
 * (`passFloorPoints != null`); boards with no points floor (e.g. Goethe,
 * whose module pass is governed by an overall percentage, not a module
 * minimum) omit it entirely.
 *
 * Band profiles (TestDaF TDN, etc.) do not use this card — the layout
 * falls back to the donut. Dispatch lives in `ModuleResultLayout`.
 *
 * Deliberately does NOT pass a wrapper `role="group"`/`aria-label`
 * (web#60 sweep). An earlier version composed
 * `${score} sur ${scoreMax} ${unitLabel}. ${objectiveLabel}
 * ${passFloorPoints}.` and put it on the outer `role="group"` div —
 * `role="group"` is not children-presentational on web (unlike
 * mobile's `accessible` View), so a screen reader announced that
 * composed name and then re-read the score/unit/objective line a
 * second time. Those are already independently readable `AppText`
 * children in the same order, so no wrapper accessible name is needed
 * — same treatment as `PriorityTaskCard` (commit `1ea9e6a`).
 */
export interface ScoreHeaderCardProps {
  /**
   * Integrated identifier eyebrow rendered at the top of the card, e.g.
   * "Total · telc · B2 · Schreiben · Teil 1". Hidden when omitted.
   */
  readonly eyebrow?: string | null;
  /**
   * The backend's authoritative module total in the board's own
   * nomenclature (telc-B2 → 0–45, ÖSD-B2 → 0–25). NEVER a client-side sum
   * of dimensions.
   */
  readonly score: number;
  /** The authoritative denominator (telc-B2 → 45, ÖSD-B2 → 25). */
  readonly scoreMax: number;
  /** Unit noun rendered after the fraction, e.g. "points". */
  readonly unitLabel: string;
  /**
   * Official pass mark carried as DATA per (board, level, skill) — not a
   * constant. Renders "📍 {objectiveLabel} {passFloorPoints}" and the gold
   * marker only when non-null.
   */
  readonly passFloorPoints?: number | null;
  /** Neutral goal-reference label, e.g. "Objectif". */
  readonly objectiveLabel?: string;
  readonly testID?: string;
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/** Position on the 0–100 % track for `part / whole`, clamped and rounded. */
function trackPercent(part: number, whole: number): `${number}%` {
  if (!(whole > 0)) return "0%";
  return `${Math.round(clamp01(part / whole) * 100)}%`;
}

export function ScoreHeaderCard({
  eyebrow,
  score,
  scoreMax,
  unitLabel,
  passFloorPoints,
  objectiveLabel = "Objectif",
  testID,
}: ScoreHeaderCardProps) {
  const showObjective =
    typeof passFloorPoints === "number" && Number.isFinite(passFloorPoints) && scoreMax > 0;

  const fillWidth = trackPercent(score, scoreMax);
  const objectiveLeft = showObjective ? trackPercent(passFloorPoints, scoreMax) : undefined;

  return (
    <div
      data-testid={testID}
      className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-line-soft bg-bg-card p-6"
    >
      {eyebrow ? (
        <AppText
          testID="score-header-eyebrow"
          tone="secondary"
          size="caption"
          weight="semi"
          className="tracking-wide uppercase"
        >
          {eyebrow}
        </AppText>
      ) : null}

      <div className="flex items-baseline gap-1">
        <AppText family="serif" size="display" weight="bold" numeric>
          {`${score}`}
        </AppText>
        <AppText tone="secondary" size="h3" weight="semi" numeric>
          {`/ ${scoreMax}`}
        </AppText>
        <AppText tone="tertiary" size="body" className="ml-1">
          {unitLabel}
        </AppText>
      </div>

      <div className="relative mt-1 flex justify-center py-[3px]">
        <div className="h-[10px] w-full overflow-hidden rounded-[var(--radius-full)] bg-line-soft">
          <div
            data-testid="score-header-fill"
            className="h-full rounded-[var(--radius-full)] bg-coach"
            style={{ width: fillWidth }}
          />
        </div>
        {showObjective && objectiveLeft !== undefined ? (
          <div
            data-testid="score-header-passline"
            className="absolute top-0 bottom-0 w-[3px] rounded-[var(--radius-full)] bg-accent-gold"
            style={{ left: objectiveLeft }}
          />
        ) : null}
      </div>

      {showObjective && objectiveLeft !== undefined ? (
        // Marker-aligned caption (prototype `.pass-label-row`): the label is
        // centred under the gold marker at `floor / scoreMax`, so the
        // wording and the line read as one neutral goal reference. The row
        // reserves vertical space because the label itself is absolutely
        // positioned.
        <div className="relative mt-1 h-[18px]">
          <AppText
            testID="score-header-objective-label"
            tone="tertiary"
            size="caption"
            className="absolute -translate-x-1/2"
            style={{ left: objectiveLeft }}
          >
            {`📍 ${objectiveLabel} ${passFloorPoints}`}
          </AppText>
        </div>
      ) : null}
    </div>
  );
}
