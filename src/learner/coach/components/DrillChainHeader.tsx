"use client";

/**
 * `DrillChainHeader` — top bar of the drill runner screen (S9 · Task
 * 9.5). Ports
 * `deutschfit-mobile/src/features/coach/components/DrillChainHeader.tsx`:
 * back button on the left, centred identity cluster (teal avatar +
 * serif title + subtitle), close button on the right; `DrillProgressPips`
 * sits immediately beneath.
 *
 * Back/close render the literal "‹"/"×" glyphs inside `AppText` — same
 * choice mobile makes, and the same pattern `CoachThreadHeader` already
 * established on web for its "☰" hamburger (a text character, not an
 * icon-set glyph — no `src/learner/core/icons` entry is invented here).
 */
import { AppText } from "@/learner/ui/primitives";

import { DrillProgressPips } from "./DrillProgressPips";

export interface DrillChainHeaderProps {
  readonly title: string;
  readonly subtitle: string;
  readonly avatarInitials: string;
  readonly onBack: () => void;
  /** Pre-translated a11y label for the back button. Required — no French fallback baked in. */
  readonly backAccessibilityLabel: string;
  /** Pre-translated a11y label for the close button. Required — no French fallback baked in. */
  readonly closeAccessibilityLabel: string;
  readonly onClose: () => void;
  /** Pre-translated progress-pip label prefix (`coach:drills.progressLabel`). */
  readonly progressLabel: string;
  readonly current: number;
  readonly total: number;
  readonly testID?: string;
}

export function DrillChainHeader({
  title,
  subtitle,
  avatarInitials,
  onBack,
  backAccessibilityLabel,
  closeAccessibilityLabel,
  onClose,
  progressLabel,
  current,
  total,
  testID,
}: DrillChainHeaderProps) {
  return (
    <div data-testid={testID}>
      <div className="flex items-center gap-2 px-2 py-2">
        <button
          type="button"
          onClick={onBack}
          aria-label={backAccessibilityLabel}
          data-testid="drill-chain-back"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] transition hover:bg-bg-content"
        >
          <AppText as="span" tone="primary" size="h3">
            {"‹"}
          </AppText>
        </button>

        <div className="flex flex-1 items-center gap-2">
          <div
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-full)] bg-coach"
          >
            <AppText as="span" tone="inverse" size="caption" weight="semi">
              {avatarInitials}
            </AppText>
          </div>
          <div className="min-w-0 flex-1">
            <AppText
              as="h1"
              tone="primary"
              family="serif"
              size="h3"
              weight="bold"
              className="truncate"
            >
              {title}
            </AppText>
            <AppText tone="tertiary" size="caption" className="mt-0.5 truncate">
              {subtitle}
            </AppText>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label={closeAccessibilityLabel}
          data-testid="drill-chain-close"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] transition hover:bg-bg-content"
        >
          <AppText as="span" tone="primary" size="h3">
            {"×"}
          </AppText>
        </button>
      </div>

      <DrillProgressPips
        current={current}
        total={total}
        label={progressLabel}
        testID="drill-chain-progress"
      />
    </div>
  );
}
