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
 */
export type CompetenceBarTone = "teal" | "amber";

export type CompetenceBarState = "priorite" | "aTravailler";

export interface CompetenceBarRowProps {
  readonly label: string;
  readonly italicSubtitle?: string;
  readonly score: number;
  readonly max: number;
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
  const fraction = max > 0 ? clamp01(score / max) : 0;
  const stateLabel = state ? STATE_LABEL[state] : undefined;
  const announcement = `${label}: ${score} sur ${max}${stateLabel ? `, ${stateLabel}` : ""}`;
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
          {`${score}/${max}`}
        </AppText>
      </div>
      <ProgressBar value={fraction} tone={TONE_BAR[tone]} className="mt-1" />
    </div>
  );
}
