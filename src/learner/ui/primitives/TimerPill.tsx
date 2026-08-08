import clsx from "clsx";

import { AppText, type AppTextTone } from "./AppText";

/**
 * `TimerPill` — ports `deutschfit-mobile/src/ui/primitives/TimerPill.tsx`.
 * Monospace countdown pill for exam runners / the Sprechen recorder. The
 * caller decides when to flip `state` to `warning` / `danger`.
 */
export type TimerState = "idle" | "warning" | "danger";

export interface TimerPillProps {
  readonly remainingMs: number;
  readonly state?: TimerState;
  readonly className?: string;
  readonly testID?: string;
}

export function formatMs(ms: number): string {
  const clamped = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  const m = String(minutes).padStart(2, "0");
  const s = String(seconds).padStart(2, "0");
  return `${m}:${s}`;
}

interface StateSpec {
  readonly classes: string;
  readonly tone: AppTextTone;
}

const STATE_SPEC: Record<TimerState, StateSpec> = {
  idle: { classes: "bg-bg-card border-line-strong", tone: "primary" },
  warning: { classes: "bg-bg-card border-priority-amber", tone: "primary" },
  danger: { classes: "bg-warning-red border-warning-red", tone: "inverse" },
};

export function TimerPill({ remainingMs, state = "idle", className, testID }: TimerPillProps) {
  const spec = STATE_SPEC[state];
  const label = formatMs(remainingMs);
  return (
    <div
      data-testid={testID}
      role="timer"
      aria-label={`Timer ${label}`}
      className={clsx(
        "inline-flex min-w-20 items-center justify-center self-start rounded-[var(--radius-full)] border px-4 py-1",
        spec.classes,
        className
      )}
    >
      <AppText tone={spec.tone} size="body" weight="semi" numeric>
        {label}
      </AppText>
    </div>
  );
}
