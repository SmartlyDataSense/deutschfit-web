import { AppText } from "@/learner/ui/primitives";

/**
 * `SRSExplanationPanel` block — ports `deutschfit-mobile/src/ui/blocks/SRSExplanationPanel.tsx`.
 *
 * Flat panel (no shadow, no card) on a `bg-content` surface — sits below
 * the cloze card once the user reveals the answer. Shows a coach-toned
 * overline and a body paragraph explaining the grammatical rule.
 *
 * Mobile's `accessibilityRole="summary"` has no web ARIA equivalent;
 * `note` is the closest, same reasoning as `EmptyState`'s `group`.
 */
export interface SRSExplanationPanelProps {
  readonly body: string;
  readonly overlineLabel: string;
  readonly testID?: string;
}

export function SRSExplanationPanel({ body, overlineLabel, testID }: SRSExplanationPanelProps) {
  return (
    <div
      data-testid={testID}
      role="note"
      aria-label={`${overlineLabel}. ${body}`}
      className="rounded-[var(--radius-md)] bg-bg-content p-4"
    >
      <AppText tone="coach" size="caption" weight="semi" className="uppercase tracking-[0.8px]">
        {overlineLabel}
      </AppText>
      <AppText size="body" className="mt-1">
        {body}
      </AppText>
    </div>
  );
}
