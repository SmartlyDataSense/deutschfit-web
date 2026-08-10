"use client";

/**
 * `DrillChainStartCTA` — the "Démarrer le drill" bubble rendered in the
 * chat transcript between the observation event and the coach's drill
 * prompt (S9 · Task 9.5). Ports
 * `deutschfit-mobile/src/features/coach/components/DrillChainStartCTA.tsx`:
 * a cream card with a coach-teal rail, a one-line title, a supporting
 * subtitle, and a solid `AppButton`.
 *
 * `CoachChatScreen` (Task 9.4) inlined an equivalent local component
 * because this file wasn't in scope yet ("not a separate file this
 * task" — see that file's docstring); this task extracts the shared
 * component and `CoachChatScreen` now imports it instead of its private
 * copy, matching mobile's file layout (one `DrillChainStartCTA`, reused
 * by the chat transcript). Visual contract + testID (`drill-chain-start-cta`
 * on the inner button) are unchanged, so the existing 9.4 chat tests
 * keep passing unmodified.
 *
 * The CTA owns no state — it's a dumb entry point. Screens pass
 * `onStart()` which is responsible for building the launch payload and
 * navigating into `/coach/drill-chain`.
 */
import { AppButton, AppText } from "@/learner/ui/primitives";

export interface DrillChainStartCTAProps {
  readonly title: string;
  readonly subtitle: string;
  readonly ctaLabel: string;
  readonly ctaAccessibilityLabel?: string;
  readonly onStart: () => void;
  readonly testID?: string;
}

export function DrillChainStartCTA({
  title,
  subtitle,
  ctaLabel,
  ctaAccessibilityLabel,
  onStart,
  testID,
}: DrillChainStartCTAProps) {
  return (
    <div
      data-testid={testID}
      className="mx-4 mb-2 flex gap-3 rounded-[var(--radius-md)] bg-bg-card p-4"
    >
      <span aria-hidden="true" className="w-0.5 shrink-0 self-stretch rounded-full bg-coach" />
      <div className="flex flex-1 flex-col gap-2">
        <AppText family="serif" size="h3" weight="bold" className="truncate">
          {title}
        </AppText>
        <AppText tone="secondary" size="body">
          {subtitle}
        </AppText>
        <AppButton
          label={ctaLabel}
          onClick={onStart}
          variant="solid"
          aria-label={ctaAccessibilityLabel ?? ctaLabel}
          testID="drill-chain-start-cta"
          className="mt-1 self-start"
        />
      </div>
    </div>
  );
}
