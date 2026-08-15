"use client";

import type { ReactNode } from "react";
import clsx from "clsx";

/**
 * `Card` — ports `deutschfit-mobile/src/ui/primitives/Card.tsx`. Cream
 * card surface with soft shadow, radius `lg` (20px, via the shared
 * `--radius-lg` token). Pass `onClick` to make it pressable.
 */
export interface CardProps {
  readonly children: ReactNode;
  readonly onClick?: () => void;
  readonly padded?: boolean;
  readonly elevated?: boolean;
  readonly className?: string;
  readonly testID?: string;
  /**
   * Mobile `accessibilityLabel` parity (`ui/primitives/Card.tsx`). When
   * set on a non-clickable card, renders `role="group" aria-label` — a
   * plain `<div>` with no ARIA role isn't a recognized accessibility
   * host, so `aria-label` alone would be silently dropped. When set on a
   * clickable card, it's just `aria-label` on the `<button>` (which
   * already has an implicit accessible role).
   */
  readonly ariaLabel?: string;
}

export function Card({
  children,
  onClick,
  padded = true,
  elevated = true,
  className,
  testID,
  ariaLabel,
}: CardProps) {
  const classes = clsx(
    "bg-bg-card rounded-[var(--radius-lg)]",
    padded && "p-4",
    elevated && "shadow-sm",
    className
  );

  if (!onClick) {
    return (
      <div
        data-testid={testID}
        className={classes}
        role={ariaLabel ? "group" : undefined}
        aria-label={ariaLabel}
      >
        {children}
      </div>
    );
  }

  return (
    <button
      type="button"
      data-testid={testID}
      onClick={onClick}
      aria-label={ariaLabel}
      className={clsx(classes, "block w-full text-left transition hover:opacity-90")}
    >
      {children}
    </button>
  );
}
