import { AppText, Chip, ProgressBar, type ProgressBarTone } from "@/learner/ui/primitives";

/**
 * `CompetenceBarRow` block — per-competence score line (mocks 06 / 09).
 * Ports `deutschfit-mobile/src/ui/blocks/CompetenceBarRow.tsx` verbatim
 * (props, math, tone map, testIDs) — RN `StyleSheet`/`View` become
 * Tailwind-token markup, `testID` becomes `data-testid`.
 *
 * Renders a single competence row inside the results / feedback panel:
 *   - serif label on the left + optional italic French subtitle
 *   - optional state chip ("Priorité" / "À travailler")
 *   - numeric `X / N` score on the right (monospace)
 *   - progress bar below the top row
 *
 * Used on:
 *   - Sprechen / Writing Feedback — mock 06
 *   - Simulation Results           — mock 09
 *
 * Tone maps:
 *   - `teal`  → ProgressBar `coach`
 *   - `amber` → ProgressBar `gold`
 *
 * S8 Task 8.8 (B3 sub-step) widened `score`/`max` from non-nullable
 * `number` to `number | null` — the simulation results screen's 4th/5th
 * skill rows (Schreiben `missing` / Sprechen `deferred`) have no real
 * number to show, and P8 forbids fabricating one (never a fake "0/0").
 * `score === null || max === null` renders an em-dash glyph in place of
 * the numeric score, a 0-fraction bar, and an aria announcement that
 * drops the "X sur Y" clause entirely. The numeric branch is otherwise
 * byte-unchanged from the pre-8.8 shape — S6 (Schreiben/Sprechen
 * feedback via `ModuleResultLayout`) and S7 always pass non-null
 * `score`/`max`, so their rendered output and aria text are identical
 * before and after this change (regression-locked in
 * `tests/unit/learner-module-result-layout.test.tsx`).
 */
export type CompetenceBarTone = "teal" | "amber";

export type CompetenceBarState = "priorite" | "aTravailler";

export interface CompetenceBarRowProps {
  readonly label: string;
  readonly italicSubtitle?: string;
  readonly score: number | null;
  readonly max: number | null;
  readonly tone?: CompetenceBarTone;
  readonly state?: CompetenceBarState;
  readonly testID?: string;
}

const STATE_LABEL: Record<CompetenceBarState, string> = {
  priorite: "Priorité",
  aTravailler: "À travailler",
};

const TONE_BAR: Record<CompetenceBarTone, ProgressBarTone> = {
  teal: "coach",
  amber: "gold",
};

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export function CompetenceBarRow({
  label,
  italicSubtitle,
  score,
  max,
  tone = "teal",
  state,
  testID,
}: CompetenceBarRowProps) {
  const stateLabel = state ? STATE_LABEL[state] : undefined;

  // Nullable branch (B3): a missing/deferred/pending-unscored module has no
  // real number — render "—" (glyph, not copy) instead of synthesizing a
  // "0/0". Numeric branch below is byte-unchanged from the pre-8.8 shape.
  let fraction: number;
  let scoreLabel: string;
  let announcement: string;
  if (score === null || max === null) {
    fraction = 0;
    scoreLabel = "—";
    announcement = `${label}: —${stateLabel ? `, ${stateLabel}` : ""}`;
  } else {
    fraction = max > 0 ? clamp01(score / max) : 0;
    scoreLabel = `${score}/${max}`;
    announcement = `${label}: ${score} sur ${max}${stateLabel ? `, ${stateLabel}` : ""}`;
  }

  return (
    <div
      role="group"
      aria-label={announcement}
      data-testid={testID}
      className="flex flex-col gap-1"
    >
      <div className="flex items-center gap-3">
        <div className="flex flex-1 flex-col gap-0.5">
          <AppText family="serif" size="body" weight="semi">
            {label}
          </AppText>
          {italicSubtitle ? (
            <AppText tone="secondary" size="caption" className="italic">
              {italicSubtitle}
            </AppText>
          ) : null}
        </div>
        {stateLabel ? <Chip label={stateLabel} selected={false} className="mr-1" /> : null}
        <AppText size="body" weight="bold" numeric>
          {scoreLabel}
        </AppText>
      </div>
      <ProgressBar value={fraction} tone={TONE_BAR[tone]} className="mt-1" />
    </div>
  );
}
