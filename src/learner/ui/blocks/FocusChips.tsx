"use client";

import { useTranslation } from "react-i18next";

import { AppText, Chip } from "@/learner/ui/primitives";

/**
 * `FocusChips` — ports `deutschfit-mobile/src/ui/blocks/FocusChips.tsx`.
 * `common:focus.label` caption + one display-only `Chip` per
 * `focusAreas` entry. Mobile's RN `ScrollView horizontal` row becomes a
 * wrapping flex row with horizontal overflow scroll on narrow viewports;
 * `testID` becomes `data-testid`. Gate (`areas.length === 0` → render
 * nothing) is internal, matching the mobile component.
 */
export interface FocusChipsProps {
  readonly areas: readonly string[];
  readonly testID?: string;
}

export function FocusChips({ areas, testID }: FocusChipsProps) {
  const { t } = useTranslation(["common"]);

  if (areas.length === 0) return null;

  const label = t("common:focus.label");

  return (
    <div
      role="group"
      aria-label={label}
      data-testid={testID ?? "focus-chips"}
      className="flex flex-col gap-2"
    >
      <AppText size="caption" weight="semi" tone="secondary" className="tracking-wide uppercase">
        {label}
      </AppText>
      <div className="flex flex-wrap gap-2 overflow-x-auto">
        {areas.map((focus, i) => (
          <Chip key={i} testID={`focus-chip-${i}`} label={focus} />
        ))}
      </div>
    </div>
  );
}
