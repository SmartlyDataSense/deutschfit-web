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
   * NOT full mobile `accessibilityLabel` parity, despite the name —
   * mobile's `accessible` View collapses all descendants into one opaque
   * accessible node, so its `accessibilityLabel` fully replaces what a
   * screen reader announces. Web has no equivalent for a container that
   * still needs its descendants individually focusable/readable (e.g. a
   * card with an interactive CTA button inside it): `role="group"` gives
   * the group itself an accessible name, but does NOT stop assistive
   * tech from also reading each descendant's own text as it continues
   * through the group. So on the non-clickable branch, only pass
   * `ariaLabel` when it is genuinely NOT already conveyed by the
   * visible children's own text — composing a label that just restates
   * those children (e.g. `${title}. ${subtitle}. ${body}`) makes a
   * screen reader announce the composed name and then re-read every
   * line a second time. When the children already read fine on their
   * own (the common case), omit `ariaLabel` entirely rather than
   * manufacturing a duplicate one. See
   * `src/learner/accueil/components/PriorityTaskCard.tsx` for a
   * consumer that deliberately omits it for this reason.
   *
   * When set on a clickable card, this is just `aria-label` on the
   * `<button>` (which already has an implicit accessible role) — that
   * branch has no equivalent double-announce risk since `<button
   * aria-label>` IS children-presentational.
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
