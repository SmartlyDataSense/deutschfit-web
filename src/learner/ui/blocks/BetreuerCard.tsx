"use client";

import { useTranslation } from "react-i18next";

import { AppText } from "@/learner/ui/primitives";

/**
 * `BetreuerCard` — ports `deutschfit-mobile/src/ui/blocks/CoachCard.tsx`
 * (Constraint 10: `CoachCard` renamed — "Coach"/"coach" is a forbidden
 * in-app identifier; Betreuer is the unnamed persona `common:coach.title`
 * already renders as "Retour du Betreuer"). Prop names stay verbatim from
 * the mobile source (`coachFeedbackFr`/`nextDrillFr`) — only the component
 * identifier changes. RN `StyleSheet`/`View`/`Text` become Tailwind-token
 * markup, `testID` becomes `data-testid`.
 */
export interface BetreuerCardProps {
  readonly coachFeedbackFr: string;
  readonly nextDrillFr?: string | null;
  readonly testID?: string;
}

export function BetreuerCard({ coachFeedbackFr, nextDrillFr, testID }: BetreuerCardProps) {
  const { t } = useTranslation(["common"]);

  return (
    <div
      data-testid={testID ?? "betreuer-card"}
      className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-line-soft bg-bg-card p-4"
    >
      <AppText family="serif" size="body" weight="semi">
        {t("common:coach.title")}
      </AppText>
      <AppText tone="secondary" size="body" className="leading-6">
        {coachFeedbackFr}
      </AppText>
      {nextDrillFr ? (
        <AppText tone="tertiary" size="small" className="leading-5">
          {nextDrillFr}
        </AppText>
      ) : null}
    </div>
  );
}
