"use client";

import type { ReactNode } from "react";
import clsx from "clsx";

import { AppText, type AppTextTone } from "./AppText";

/**
 * `Chip` — ports `deutschfit-mobile/src/ui/primitives/Chip.tsx`. Two
 * interaction states: idle (cream surface, soft border) / selected
 * (filled CTA orange, always wins over `tone`). Renders a plain `<div>`
 * when `onClick` is omitted (display-only chip), a `<button>` otherwise.
 *
 * `tone` (#51 items 1/6/7) — added for the idle/display-only case, mirrors
 * mobile's `Pill` tone palette (`gold` / `success` / `neutral` / `warning`;
 * mobile's `Pill` also has a `premium` tone, unused by any current web
 * call site so not ported here — add it the same way if a site needs it).
 * `neutral` (the default) reproduces the exact idle look every existing
 * untoned call site already had, so this is additive: no call site
 * changes appearance unless it opts into a tone.
 */
export type ChipTone = "neutral" | "success" | "warning" | "gold";

export interface ChipProps {
  readonly label: string;
  readonly selected?: boolean;
  readonly tone?: ChipTone;
  readonly onClick?: () => void;
  readonly leading?: ReactNode;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly testID?: string;
}

interface ChipToneSpec {
  readonly border: string;
  readonly bg: string;
  readonly textTone: AppTextTone;
}

const TONE_SPECS: Record<ChipTone, ChipToneSpec> = {
  neutral: { border: "border-line-soft", bg: "bg-bg-hero", textTone: "primary" },
  // AA-safe `successText` (5.39:1), not AppText's own `success` (vivid
  // `--color-success-green`, ~3.49:1 on bg-hero — fails AA body) — see
  // AppText.tsx's `successText` doc comment.
  success: { border: "border-success-green", bg: "bg-bg-hero", textTone: "successText" },
  warning: { border: "border-warning-red", bg: "bg-bg-hero", textTone: "warning" },
  gold: { border: "border-accent-gold", bg: "bg-accent-gold", textTone: "primary" },
};

export function Chip({
  label,
  selected = false,
  tone = "neutral",
  onClick,
  leading,
  disabled = false,
  className,
  testID,
}: ChipProps) {
  const spec = TONE_SPECS[tone];
  const textTone: AppTextTone = selected ? "ctaLabel" : spec.textTone;

  const content = (
    <>
      {leading ? <span className="mr-1 inline-flex items-center">{leading}</span> : null}
      {/* #50 (a11y): selected uses "ctaLabel", not "inverse" — measured
          2.87:1 on bg-cta, fails AA body; ctaLabel reaches 5.20:1. See
          --color-cta-label in globals.css. */}
      <AppText tone={textTone} size="small" weight="medium">
        {label}
      </AppText>
    </>
  );

  const classes = clsx(
    "inline-flex min-h-8 items-center self-start rounded-[var(--radius-full)] border px-4 py-1",
    selected ? "border-cta bg-cta" : clsx(spec.border, spec.bg),
    disabled ? "opacity-50" : null,
    className
  );

  if (!onClick) {
    return (
      <div data-testid={testID} className={classes}>
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      data-testid={testID}
      disabled={disabled}
      aria-pressed={selected}
      onClick={() => {
        if (disabled) return;
        onClick();
      }}
      className={clsx(
        classes,
        "transition disabled:cursor-not-allowed",
        !disabled && "hover:opacity-85"
      )}
    >
      {content}
    </button>
  );
}
