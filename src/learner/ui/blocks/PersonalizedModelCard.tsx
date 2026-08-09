"use client";

import { useTranslation } from "react-i18next";

import { AppText } from "@/learner/ui/primitives";

/**
 * `PersonalizedModelCard` — ports
 * `deutschfit-mobile/src/ui/blocks/PersonalizedModelCard.tsx` verbatim
 * (prop names, internal null-gate). `common:personalizedModel.{title,
 * subtitle}` + `text` (German prose). RN `StyleSheet`/`View`/`Text`
 * become Tailwind-token markup, `testID` becomes `data-testid`.
 */
export interface PersonalizedModelCardProps {
  readonly text: string | null;
  readonly testID?: string;
}

export function PersonalizedModelCard({ text, testID }: PersonalizedModelCardProps) {
  const { t } = useTranslation(["common"]);

  if (!text) return null;

  return (
    <div
      data-testid={testID ?? "personalized-model-card"}
      className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-line-soft bg-bg-subtle p-4"
    >
      <AppText family="serif" size="body" weight="semi">
        {t("common:personalizedModel.title")}
      </AppText>
      <AppText tone="tertiary" size="caption" className="tracking-wide uppercase">
        {t("common:personalizedModel.subtitle")}
      </AppText>
      <AppText tone="secondary" size="body" className="leading-6">
        {text}
      </AppText>
    </div>
  );
}
