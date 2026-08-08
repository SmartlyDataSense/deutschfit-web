import clsx from "clsx";

/**
 * `ProgressBar` — ports `deutschfit-mobile/src/ui/primitives/ProgressBar.tsx`.
 * Determinate mode: pass `value` (0–1), fills to that fraction.
 * Indeterminate: omit `value` — renders a fixed 25% bar (no animated loop
 * yet, same as mobile's Phase 1).
 */
export type ProgressBarTone = "cta" | "coach" | "success" | "gold";

export interface ProgressBarProps {
  readonly value?: number;
  readonly tone?: ProgressBarTone;
  readonly "aria-label"?: string;
  readonly className?: string;
  readonly testID?: string;
}

const TONE_CLASS: Record<ProgressBarTone, string> = {
  cta: "bg-cta",
  coach: "bg-coach",
  success: "bg-success-green",
  gold: "bg-accent-gold",
};

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export function ProgressBar({
  value,
  tone = "cta",
  "aria-label": ariaLabel,
  className,
  testID,
}: ProgressBarProps) {
  const clamped = value === undefined ? undefined : clamp01(value);
  const widthPct = clamped === undefined ? 25 : Math.round(clamped * 100);

  return (
    <div
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped === undefined ? undefined : widthPct}
      data-testid={testID}
      className={clsx("h-1.5 overflow-hidden rounded-[var(--radius-full)] bg-line-soft", className)}
    >
      <div
        className={clsx("h-full rounded-[var(--radius-full)]", TONE_CLASS[tone])}
        style={{ width: `${widthPct}%` }}
      />
    </div>
  );
}
