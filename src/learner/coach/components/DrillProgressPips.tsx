"use client";

/**
 * `DrillProgressPips` — header progress indicator for the drill chain
 * (S9 · Task 9.5). Ports
 * `deutschfit-mobile/src/features/coach/components/DrillProgressPips.tsx`:
 * a "Drill N / M" label followed by a row of dot pips — completed pips
 * filled coach-teal, the current pip outlined (half-opacity) teal,
 * remaining pips soft-line.
 */
import { AppText } from "@/learner/ui/primitives";

export interface DrillProgressPipsProps {
  /** 1-based position of the active drill in the chain. */
  readonly current: number;
  readonly total: number;
  /** Pre-translated label prefix (`coach:drills.progressLabel`). */
  readonly label: string;
  readonly testID?: string;
}

export function DrillProgressPips({ current, total, label, testID }: DrillProgressPipsProps) {
  const safeTotal = Math.max(1, total);
  const safeCurrent = Math.max(1, Math.min(current, safeTotal));
  const pips = Array.from({ length: safeTotal }, (_, idx) => idx + 1);

  return (
    <div className="flex items-center gap-2 px-4 py-2" data-testid={testID}>
      <AppText tone="secondary" size="caption" weight="semi" className="tracking-wide">
        {`${label} ${safeCurrent} / ${safeTotal}`}
      </AppText>
      <div className="flex items-center gap-1" aria-hidden="true">
        {pips.map((n) => (
          <span
            key={n}
            data-testid={`drill-pip-${n}`}
            className={`h-2 w-2 rounded-[var(--radius-full)] ${
              n < safeCurrent
                ? "bg-coach"
                : n === safeCurrent
                  ? "bg-coach opacity-50"
                  : "bg-line-soft"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
