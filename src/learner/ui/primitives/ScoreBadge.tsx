import clsx from "clsx";

import { AppText, type AppTextTone } from "./AppText";

/**
 * `ScoreBadge` — ports `deutschfit-mobile/src/ui/primitives/ScoreBadge.tsx`.
 * Big numeric score + label, e.g. "68/100" on the simulation results
 * screen. Numbers render in mono (numeric) for tabular alignment.
 */
export type ScoreBadgeTone = "success" | "warning" | "neutral" | "gold";

export interface ScoreBadgeProps {
  readonly score: number;
  readonly total?: number;
  readonly label?: string;
  readonly tone?: ScoreBadgeTone;
  readonly className?: string;
  readonly testID?: string;
}

const TONE_MAP: Record<ScoreBadgeTone, AppTextTone> = {
  success: "success",
  warning: "warning",
  neutral: "primary",
  gold: "gold",
};

export function ScoreBadge({
  score,
  total = 100,
  label,
  tone = "neutral",
  className,
  testID,
}: ScoreBadgeProps) {
  return (
    <div data-testid={testID} className={clsx("flex flex-col items-start", className)}>
      <div className="flex items-baseline gap-1">
        <AppText tone={TONE_MAP[tone]} size="display" weight="bold" numeric>
          {String(score)}
        </AppText>
        <AppText tone="tertiary" size="bodyLg" numeric className="mb-0.5">
          {`/${total}`}
        </AppText>
      </div>
      {label ? (
        <AppText tone="secondary" size="small" weight="medium">
          {label}
        </AppText>
      ) : null}
    </div>
  );
}
