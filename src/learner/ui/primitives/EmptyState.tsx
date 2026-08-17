import type { ReactNode } from "react";
import clsx from "clsx";

import { AppButton } from "./AppButton";
import { AppText } from "./AppText";

/**
 * `EmptyState` — ports `deutschfit-mobile/src/ui/blocks/EmptyState.tsx`.
 * Canonical empty-state panel: optional illustration, serif title,
 * secondary description, optional `AppButton` CTA.
 *
 * No default illustration (web#60 sweep). Mobile's port defaulted to a
 * book emoji (📖), but that glyph is outside the brand-voice-locked
 * emoji set (`📍 ⏱ ✓ ✕`) — a hard-lock violation baked into a shared
 * primitive with ~28 consumers. None of the four allowed glyphs map
 * cleanly onto "nothing here yet" without misleading (✕ reads as
 * failure, not absence), and neither the icon sprite
 * (`@/learner/core/icons/iconSprite.tsx`) nor the 5 inlined Ionicons
 * carry a dedicated "empty" mark — inventing one is forbidden by the
 * icon-source lock. So the sensible default is no illustration at all;
 * callers that want one pass their own approved icon/glyph via
 * `illustration`.
 *
 * Deliberately does NOT pass a wrapper `role="group"`/`aria-label`
 * (web#60 sweep). An earlier version composed
 * `description ? \`${title}. ${description}\` : title` and put it on
 * the outer `role="group"` div — `role="group"` is not children-
 * presentational on web (unlike mobile's `accessible` View), so a
 * screen reader announced that composed name and then re-read the
 * title/description `AppText` children a second time. Those already
 * read fine as independently readable nodes in the same order, so no
 * wrapper accessible name is needed — same treatment as
 * `PriorityTaskCard` (commit `1ea9e6a`).
 */
export interface EmptyStateProps {
  readonly title: string;
  readonly description?: string;
  /** No default — pass an approved icon/glyph node to render one. */
  readonly illustration?: ReactNode;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
  readonly actionAccessibilityLabel?: string;
  readonly className?: string;
  readonly testID?: string;
}

export function EmptyState({
  title,
  description,
  illustration,
  actionLabel,
  onAction,
  actionAccessibilityLabel,
  className,
  testID,
}: EmptyStateProps) {
  const showCta = Boolean(actionLabel && onAction);

  return (
    <div
      data-testid={testID}
      className={clsx(
        "flex flex-col items-center justify-center gap-2 px-6 py-8 text-center",
        className
      )}
    >
      {illustration ? (
        <div aria-hidden="true" className="mb-1">
          {illustration}
        </div>
      ) : null}

      <AppText as="p" tone="primary" family="serif" size="h3" weight="bold" align="center">
        {title}
      </AppText>

      {description ? (
        <AppText
          tone="secondary"
          size="body"
          align="center"
          className="max-w-[var(--empty-state-max-width)]"
        >
          {description}
        </AppText>
      ) : null}

      {showCta && actionLabel && onAction ? (
        <AppButton
          testID={testID ? `${testID}-cta` : undefined}
          label={actionLabel}
          onClick={onAction}
          aria-label={actionAccessibilityLabel ?? actionLabel}
          className="mt-4 min-w-[var(--empty-state-action-min-width)]"
        />
      ) : null}
    </div>
  );
}
