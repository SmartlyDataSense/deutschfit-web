import type { ReactNode } from "react";
import clsx from "clsx";

import { AppButton } from "./AppButton";
import { AppText } from "./AppText";

/**
 * `EmptyState` — ports `deutschfit-mobile/src/ui/blocks/EmptyState.tsx`.
 * Canonical empty-state panel: optional illustration (defaults to a book
 * emoji, matching mobile), serif title, secondary description, optional
 * `AppButton` CTA.
 *
 * Accessibility: the container is a single `role="group"` with
 * `aria-label` merging title + description, so screen readers announce it
 * as one region instead of stuttering across separate title/body reads —
 * same rationale as mobile's `accessibilityRole="summary"` (there is no
 * web ARIA role named "summary"; `group` + `aria-label` is the closest
 * equivalent).
 */
export interface EmptyStateProps {
  readonly title: string;
  readonly description?: string;
  /** Defaults to a book emoji (📖). Pass a custom node to override. */
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
  const announcement = description ? `${title}. ${description}` : title;

  return (
    <div
      role="group"
      aria-label={announcement}
      data-testid={testID}
      className={clsx(
        "flex flex-col items-center justify-center gap-2 px-6 py-8 text-center",
        className
      )}
    >
      <div aria-hidden="true" className="mb-1">
        {illustration ?? (
          <AppText as="span" tone="gold" size="display" weight="regular" align="center">
            {"\u{1F4D6}"}
          </AppText>
        )}
      </div>

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
