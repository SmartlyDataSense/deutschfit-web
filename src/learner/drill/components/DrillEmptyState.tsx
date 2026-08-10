"use client";

/**
 * `DrillEmptyState` — renders the brand-voice copy for every non-`ok`
 * `DrillReason` returned by `drill-recommend` (S9 · Task 9.6). Web port
 * of
 * `deutschfit-mobile/src/features/drill/components/DrillEmptyState.tsx`
 * onto `@/learner/ui/primitives`; `copyFor` ported byte-for-byte — see
 * `SessionMcqCard`'s docstring for why this screen hardcodes rather
 * than keying through `drill.json`.
 *
 * Copy follows brand-voice.md §12: Marie persona is the learner, `tu`
 * form throughout. No `Coach`, no `entraînement`, no `streak`, no
 * fitness vocabulary. The "Exercices" eyebrow is approved vocabulary
 * for drill surfaces.
 */
import { AppText, Card } from "@/learner/ui/primitives";

import type { DrillReason } from "../api/drillClient";

export interface DrillEmptyStateProps {
  readonly reason: DrillReason;
  readonly userLevel: string;
  readonly onRetry?: () => void;
  readonly testID?: string;
}

export function DrillEmptyState({ reason, userLevel, onRetry, testID }: DrillEmptyStateProps) {
  const { title, body } = copyFor(reason, userLevel);
  return (
    <Card testID={testID}>
      <AppText as="h2" size="caption" weight="semi" tone="tertiary">
        Exercices
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
            Réessayer
          </AppText>
        </button>
      ) : null}
    </Card>
  );
}

function copyFor(reason: DrillReason, level: string): { title: string; body: string } {
  switch (reason) {
    case "level_not_supported_yet":
      return {
        title: `Niveau ${level} — bientôt`,
        body: "Les exercices personnalisés sont d'abord disponibles pour le niveau B1. Ton niveau arrive bientôt.",
      };
    case "no_gaps_yet":
      return {
        title: "Fais ta première rédaction",
        body: "Soumets une rédaction pour débloquer ton exercice du jour.",
      };
    case "no_missing_structures":
      return {
        title: "Aucun point à retravailler ici",
        body: "Beau travail. Continue comme ça.",
      };
    case "review_mode":
      return {
        title: "Révision",
        body: "Tu maîtrises tes points. On garde la main avec quelques rappels.",
      };
    case "error":
      return {
        title: "Petit souci",
        body: "Impossible de charger ton exercice pour l'instant.",
      };
    case "ok":
      return { title: "", body: "" };
  }
}
