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
}

export function Card({
  children,
  onClick,
  padded = true,
  elevated = true,
  className,
  testID,
}: CardProps) {
  const classes = clsx(
    "bg-bg-card rounded-[var(--radius-lg)]",
    padded && "p-4",
    elevated && "shadow-sm",
    className
  );

  if (!onClick) {
    return (
      <div data-testid={testID} className={classes}>
        {children}
      </div>
    );
  }

  return (
    <button
      type="button"
      data-testid={testID}
      onClick={onClick}
      className={clsx(classes, "block w-full text-left transition hover:opacity-90")}
    >
      {children}
    </button>
  );
}
