"use client";

import type { ReactNode } from "react";
import clsx from "clsx";

import { AppText } from "./AppText";

/**
 * `Chip` — ports `deutschfit-mobile/src/ui/primitives/Chip.tsx`. Two
 * states: idle (cream surface, soft border) / selected (filled CTA
 * orange). Renders a plain `<div>` when `onClick` is omitted (display-only
 * chip), a `<button>` otherwise.
 */
export interface ChipProps {
  readonly label: string;
  readonly selected?: boolean;
  readonly onClick?: () => void;
  readonly leading?: ReactNode;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly testID?: string;
}

export function Chip({
  label,
  selected = false,
  onClick,
  leading,
  disabled = false,
  className,
  testID,
}: ChipProps) {
  const content = (
    <>
      {leading ? <span className="mr-1 inline-flex items-center">{leading}</span> : null}
      {/* #50 (a11y): selected uses "ctaLabel", not "inverse" — measured
          2.87:1 on bg-cta, fails AA body; ctaLabel reaches 5.20:1. See
          --color-cta-label in globals.css. */}
      <AppText tone={selected ? "ctaLabel" : "primary"} size="small" weight="medium">
        {label}
      </AppText>
    </>
  );

  const classes = clsx(
    "inline-flex min-h-8 items-center self-start rounded-[var(--radius-full)] border px-4 py-1",
    selected ? "border-cta bg-cta" : "border-line-soft bg-bg-hero",
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
