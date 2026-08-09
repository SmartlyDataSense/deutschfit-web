"use client";

/**
 * Accueil-feature `PriorityTaskCard` — web port of
 * `deutschfit-mobile/src/features/accueil/components/PriorityTaskCard.tsx`
 * (S3 · Task 3.8). The cream task card on mock #3.
 *
 * Pairs a terracotta "Priorité" pill + skill tag in a meta row, a serif
 * H2 title ("Exercices du jour"), a subtitle ("4 exercices ciblés"), a
 * descriptive body paragraph, and a premium CTA pill ("Commencer · 10
 * min").
 *
 * Composes primitives from `@/learner/ui/primitives` only — no hex /
 * font-size / spacing literals.
 *
 * S3 · Task 3.8 parity note — the drill session lands in S9. Both the
 * active and the empty-branch CTA render `disabled` in this slice; no
 * navigation is wired yet. `onCtaPress` is still threaded through (and
 * still asserted in tests) so S9 only has to drop the `disabled` flag.
 */
import { AppButton, AppText, Card, Chip } from "@/learner/ui/primitives";

export interface PriorityTaskCardProps {
  readonly priorityLabel: string;
  readonly skill: string;
  readonly title: string;
  readonly subtitle: string;
  readonly body: string;
  readonly ctaLabel: string;
  readonly durationLabel: string;
  readonly onCtaPress: () => void;
  /**
   * Empty / A-state branch — when the home screen has no eligible
   * priority task (no unstarted item matches the user's level / active
   * skills), render a calm placeholder instead of fixture data. Pass
   * `empty` with localized copy and the card swaps to the empty layout.
   */
  readonly empty?: {
    readonly title: string;
    readonly body: string;
    readonly ctaLabel: string;
  };
  readonly testID?: string;
}

export function PriorityTaskCard({
  priorityLabel,
  skill,
  title,
  subtitle,
  body,
  ctaLabel,
  durationLabel,
  onCtaPress,
  empty,
  testID,
}: PriorityTaskCardProps) {
  if (empty) {
    return (
      <Card testID={testID}>
        <AppText family="serif" size="h3" weight="bold" className="mt-2">
          {empty.title}
        </AppText>
        <AppText tone="secondary" size="body" className="mt-2">
          {empty.body}
        </AppText>
        <div className="mt-4 flex items-center gap-2">
          <AppButton
            label={empty.ctaLabel}
            onClick={onCtaPress}
            variant="ghost"
            disabled
            testID={testID ? `${testID}-empty-cta` : undefined}
          />
        </div>
      </Card>
    );
  }

  const composedCta = `${ctaLabel} · ${durationLabel}`;
  return (
    <Card testID={testID}>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <div className="self-start rounded-[var(--radius-full)] border border-cta bg-bg-hero px-3 py-0.5">
          <AppText tone="cta" size="caption" weight="semi">
            {priorityLabel}
          </AppText>
        </div>
        <Chip label={skill} testID={testID ? `${testID}-skill` : undefined} />
      </div>
      <AppText family="serif" size="h2" weight="bold" className="mt-2">
        {title}
      </AppText>
      <AppText tone="secondary" size="body" className="mt-1">
        {subtitle}
      </AppText>
      <AppText tone="secondary" size="body" className="mt-2">
        {body}
      </AppText>
      <div className="mt-4 flex items-center gap-2">
        <AppButton
          label={composedCta}
          onClick={onCtaPress}
          variant="premium"
          disabled
          testID={testID ? `${testID}-cta` : undefined}
        />
      </div>
    </Card>
  );
}
