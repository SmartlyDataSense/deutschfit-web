import { AppText, ProgressBar } from "@/learner/ui/primitives";

/**
 * `SRSProgressFooter` block — ports `deutschfit-mobile/src/ui/blocks/SRSProgressFooter.tsx`.
 *
 * A thin footer pinned to the bottom of the review screen. Two inline
 * labels frame a progress bar. Pure / prop-driven — S10-D1: both labels
 * are caller-owned required props (mobile's default remaining-label copy
 * does not port to web).
 */
export interface SRSProgressFooterProps {
  readonly currentIndex: number;
  readonly total: number;
  readonly positionLabel: string;
  readonly remainingLabel: string;
  readonly testID?: string;
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export function SRSProgressFooter({
  currentIndex,
  total,
  positionLabel,
  remainingLabel,
  testID,
}: SRSProgressFooterProps) {
  const safeTotal = total > 0 ? total : 1;
  const fraction = total > 0 ? clamp01(currentIndex / safeTotal) : 0;

  return (
    <div data-testid={testID}>
      <div className="flex items-center justify-between">
        <AppText
          tone="tertiary"
          size="caption"
          weight="semi"
          className="uppercase tracking-[0.8px]"
        >
          {positionLabel}
        </AppText>
        <AppText
          tone="tertiary"
          size="caption"
          weight="semi"
          className="uppercase tracking-[0.8px]"
        >
          {remainingLabel}
        </AppText>
      </div>
      <ProgressBar value={fraction} tone="cta" aria-label={positionLabel} className="mt-1" />
    </div>
  );
}
