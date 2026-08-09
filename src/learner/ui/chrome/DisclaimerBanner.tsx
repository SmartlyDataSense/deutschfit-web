"use client";

import { useTranslation } from "react-i18next";
import clsx from "clsx";

import { AppText } from "@/learner/ui/primitives";

/**
 * `DisclaimerBanner` — ports `deutschfit-mobile/src/ui/primitives/DisclaimerBanner.tsx`.
 * "AI estimate, not an official result" footer used on every results
 * surface. `compact` (default `false`) swaps the two-line full copy for
 * the one-line short variant — same `common:disclaimer.{full,short}`
 * locale keys mobile uses (already present in this repo's `common.json`,
 * verified against the working tree — no new copy authored here).
 *
 * First consumer: `LesenResultsScreen` (Task 4.9), passed `compact` to
 * match mobile's `LesenResultsScreen` usage.
 */
export interface DisclaimerBannerProps {
  readonly compact?: boolean;
  readonly className?: string;
}

export function DisclaimerBanner({ compact = false, className }: DisclaimerBannerProps) {
  const { t } = useTranslation(["common"]);

  return (
    <div
      data-testid="disclaimer-banner"
      className={clsx(
        "rounded-[var(--radius-sm)] border border-line-soft bg-bg-subtle",
        compact ? "px-3 py-1.5" : "px-4 py-2",
        className
      )}
    >
      <AppText tone="tertiary" size={compact ? "caption" : "small"}>
        {compact ? t("common:disclaimer.short") : t("common:disclaimer.full")}
      </AppText>
    </div>
  );
}
