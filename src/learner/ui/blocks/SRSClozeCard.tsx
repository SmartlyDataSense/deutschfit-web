"use client";

import type { ReactNode } from "react";

import { AppText, Card } from "@/learner/ui/primitives";

/**
 * `SRSClozeCard` block — ports `deutschfit-mobile/src/ui/blocks/SRSClozeCard.tsx`.
 * The top card in the spaced-repetition review screen. Shows:
 *   - a gold "Dû depuis Xj" pill on the top right (inline `<span>` — web
 *     has no `Pill` primitive; this span IS the port, not a stand-in)
 *   - a subject overline (e.g. "Connecteurs B1")
 *   - an instruction overline (e.g. "COMPLÉTEZ")
 *   - the cloze sentence (caller supplies a `ReactNode` so the blank can
 *     be styled inline)
 *   - a tertiary-italic translation quote
 *
 * S10-D1: every mobile-defaulted label (`instructionLabel`) is a
 * REQUIRED-or-absent prop here — no hardcoded French fallback.
 *
 * The reveal CTA is not part of this block: `RevisionScreen` renders its
 * own standalone `AppButton` (S10 fix round T1) so it can wire a testID
 * and `variant="solid"` that this card's internal slot never supported.
 */
export interface SRSClozeCardProps {
  readonly dueLabel?: string;
  readonly subjectLabel: string;
  readonly clozeSentence: ReactNode;
  readonly translation?: string;
  readonly instructionLabel: string;
  readonly testID?: string;
}

export function SRSClozeCard({
  dueLabel,
  subjectLabel,
  clozeSentence,
  translation,
  instructionLabel,
  testID,
}: SRSClozeCardProps) {
  return (
    <Card testID={testID}>
      <div className="flex items-center justify-between gap-2">
        <AppText
          tone="tertiary"
          size="caption"
          weight="semi"
          className="uppercase tracking-[0.8px]"
        >
          {subjectLabel}
        </AppText>
        {dueLabel ? (
          <span
            data-testid={testID ? `${testID}-due` : undefined}
            className="rounded-[var(--radius-full)] bg-accent-gold px-3 py-1 text-xs font-semibold text-accent-gold-ink"
          >
            {dueLabel}
          </span>
        ) : null}
      </div>
      <AppText
        tone="coach"
        size="caption"
        weight="semi"
        className="mt-4 uppercase tracking-[0.8px]"
      >
        {instructionLabel}
      </AppText>
      <div className="mt-1">
        <AppText family="serif" size="h3" weight="semi">
          {clozeSentence}
        </AppText>
      </div>
      {translation ? (
        <AppText tone="tertiary" size="small" className="mt-2 italic">
          {`« ${translation} »`}
        </AppText>
      ) : null}
    </Card>
  );
}
