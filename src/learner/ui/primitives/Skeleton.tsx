import clsx from "clsx";

/**
 * `Skeleton` — ports `deutschfit-mobile/src/ui/blocks/Skeleton.tsx`.
 * Silent shape-placeholder for loading states (founding-doc §17 — "no
 * visible waiting"): no spinner glyphs, no percentage text, no
 * "loading…" copy. Opacity-only pulse via Tailwind's built-in
 * `animate-pulse` (no shimmer gradient).
 *
 * `Skeleton.Block` / `Skeleton.Text` / `Skeleton.Card` — the bare
 * `Skeleton` symbol intentionally has no default render, forcing callers
 * to pick a variant (same as mobile).
 */
const DEFAULT_A11Y_LABEL = "Contenu en cours de chargement";

interface BaseSkeletonProps {
  readonly testID?: string;
  readonly "aria-label"?: string;
  readonly className?: string;
}

export interface SkeletonBlockProps extends BaseSkeletonProps {
  readonly width?: string | number;
  readonly height?: string | number;
}

export interface SkeletonTextProps extends BaseSkeletonProps {
  readonly width?: string | number;
  readonly lineHeight?: number;
}

export interface SkeletonCardProps extends BaseSkeletonProps {
  readonly showBodyLine?: boolean;
}

function SkeletonBlock({
  width = "100%",
  height = 16,
  "aria-label": ariaLabel = DEFAULT_A11Y_LABEL,
  testID,
  className,
}: SkeletonBlockProps) {
  return (
    <div
      role="img"
      aria-label={ariaLabel}
      data-testid={testID}
      className={clsx("animate-pulse rounded-[var(--radius-sm)] bg-line-soft", className)}
      style={{ width, height }}
    />
  );
}

function SkeletonText({
  width = "70%",
  lineHeight = 14,
  "aria-label": ariaLabel = DEFAULT_A11Y_LABEL,
  testID,
  className,
}: SkeletonTextProps) {
  return (
    <SkeletonBlock
      width={width}
      height={lineHeight}
      aria-label={ariaLabel}
      testID={testID}
      className={className}
    />
  );
}

function SkeletonCard({
  showBodyLine = true,
  "aria-label": ariaLabel = DEFAULT_A11Y_LABEL,
  testID,
  className,
}: SkeletonCardProps) {
  return (
    <div
      role="img"
      aria-label={ariaLabel}
      data-testid={testID}
      className={clsx(
        "flex flex-col gap-1 rounded-[var(--radius-md)] bg-bg-subtle px-4 py-4",
        className
      )}
    >
      <SkeletonBlock width="55%" height={18} aria-label={ariaLabel} />
      <SkeletonBlock width="80%" height={14} aria-label={ariaLabel} />
      {showBodyLine ? <SkeletonBlock width="40%" height={14} aria-label={ariaLabel} /> : null}
    </div>
  );
}

export const Skeleton = {
  Block: SkeletonBlock,
  Text: SkeletonText,
  Card: SkeletonCard,
} as const;
