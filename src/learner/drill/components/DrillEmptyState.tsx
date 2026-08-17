"use client";

/**
 * `DrillEmptyState` — renders the brand-voice copy for every non-`ok`
 * `DrillReason` returned by `drill-recommend` (S9 · Task 9.6). Web port
 * of
 * `deutschfit-mobile/src/features/drill/components/DrillEmptyState.tsx`
 * onto `@/learner/ui/primitives`; `copyFor` ported byte-for-byte at
 * first, then routed through `drill:emptyState.*` in task 8 (#39) — the
 * French had already shipped and already passed brand voice; only the
 * English side was missing, which was translation, not new copy.
 *
 * Copy follows brand-voice.md §12: Marie persona is the learner, `tu`
 * form throughout. No `Coach`, no `entraînement`, no `streak`, no
 * fitness vocabulary. The "Exercices" eyebrow is approved vocabulary
 * for drill surfaces.
 */
import { useTranslation } from "react-i18next";

import { AppText, Card } from "@/learner/ui/primitives";

import type { DrillReason } from "../api/drillClient";

export interface DrillEmptyStateProps {
  readonly reason: DrillReason;
  readonly userLevel: string;
  readonly onRetry?: () => void;
  readonly testID?: string;
}

export function DrillEmptyState({ reason, userLevel, onRetry, testID }: DrillEmptyStateProps) {
  const { t } = useTranslation(["drill"]);
  const { title, body } = copyFor(reason, userLevel, t);
  return (
    <Card testID={testID}>
      <AppText as="h2" size="caption" weight="semi" tone="tertiary">
        {t("drill:emptyState.eyebrow")}
      </AppText>
      <AppText size="h3" weight="bold" className="mt-1">
        {title}
      </AppText>
      <AppText size="body" tone="secondary" className="mt-1">
        {body}
      </AppText>
      {reason === "error" && onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          data-testid={testID ? `${testID}-retry` : undefined}
          className="mt-2"
        >
          <AppText size="body" weight="semi" tone="cta">
            {t("drill:emptyState.retry")}
          </AppText>
        </button>
      ) : null}
    </Card>
  );
}

function copyFor(
  reason: DrillReason,
  level: string,
  t: (key: string, options?: Record<string, unknown>) => string
): { title: string; body: string } {
  switch (reason) {
    case "level_not_supported_yet":
      return {
        title: t("drill:emptyState.levelNotSupportedYet.title", { level }),
        body: t("drill:emptyState.levelNotSupportedYet.body"),
      };
    case "no_gaps_yet":
      return {
        title: t("drill:emptyState.noGapsYet.title"),
        body: t("drill:emptyState.noGapsYet.body"),
      };
    case "no_missing_structures":
      return {
        title: t("drill:emptyState.noMissingStructures.title"),
        body: t("drill:emptyState.noMissingStructures.body"),
      };
    case "review_mode":
      return {
        title: t("drill:emptyState.reviewMode.title"),
        body: t("drill:emptyState.reviewMode.body"),
      };
    case "error":
      return {
        title: t("drill:emptyState.error.title"),
        body: t("drill:emptyState.error.body"),
      };
    case "ok":
      return { title: "", body: "" };
  }
}
