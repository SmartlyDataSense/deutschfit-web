/**
 * `ObservationCard` — the Coach chat "Observation IA" event card (S9 ·
 * Task 9.4). Ports
 * `deutschfit-mobile/src/features/coach/components/ObservationCard.tsx`
 * (which wraps the shared `@ui/blocks/CoachObservationCard`). Web has no
 * equivalent shared block yet, so this port inlines the card body + rail
 * directly (same visual contract: teal rail, overline, body, chip row)
 * rather than introducing a new `@/learner/ui/blocks` primitive for a
 * single caller.
 *
 * Connector chips reuse the existing `Chip` primitive (display-only, no
 * `onClick`) instead of porting mobile's `InlineCorrectionChip` variant
 * system — no web equivalent exists and this is the only caller.
 *
 * Deliberately does NOT pass a wrapper `role="group"`/`aria-label`
 * (web#60 sweep). An earlier version composed
 * `${overlineLabel}. ${body}` and put it on the outer `role="group"`
 * div — `role="group"` is not children-presentational on web (unlike
 * mobile's `accessible` View), so a screen reader announced that
 * composed name and then re-read the overline/body `AppText` children a
 * second time. Those already read fine as independently readable nodes
 * in the same order, so no wrapper accessible name is needed — same
 * treatment as `PriorityTaskCard` (commit `1ea9e6a`).
 */
import { AppText, Chip } from "@/learner/ui/primitives";

export interface ObservationCardProps {
  readonly body: string;
  readonly connectors: readonly string[];
  /**
   * Pre-translated overline (`coach:chat.scripted.observation.overline`).
   * Required — no French fallback baked into this component, so an
   * `en`-locale caller can't silently render untranslated copy by
   * omitting the prop.
   */
  readonly overlineLabel: string;
  readonly testID?: string;
}

export function ObservationCard({ body, connectors, overlineLabel, testID }: ObservationCardProps) {
  return (
    <div
      data-testid={testID}
      className="mx-4 mb-2 flex gap-3 rounded-[var(--radius-md)] bg-bg-card p-4"
    >
      <span aria-hidden="true" className="w-0.5 shrink-0 self-stretch rounded-full bg-coach" />
      <div className="flex flex-1 flex-col gap-1">
        <AppText tone="coach" size="caption" weight="semi" className="uppercase tracking-wide">
          {overlineLabel}
        </AppText>
        <AppText size="body">{body}</AppText>
        {connectors.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {connectors.map((label) => (
              <Chip key={label} label={label} testID={`observation-chip-${label}`} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
