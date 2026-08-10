"use client";

/**
 * `SessionResults` — closes an adaptive drill session (System A — S9 ·
 * Task 9.6): a plain score, a Betreuer one-liner, and a compact
 * missed-concepts recap (absent on a perfect run). No pass/fail
 * framing — the recap is a same-session reminder only, the real
 * re-serve is the backend's job via the `redo` surface. Web port of
 * `deutschfit-mobile/src/features/drill/components/SessionResults.tsx`
 * onto `@/learner/ui/primitives`.
 *
 * Copy hardcoded FR, ported byte-for-byte from mobile
 * (task-9.6-brief.md Step 5), including `betreuerLine` verbatim — see
 * `SessionMcqCard`'s docstring for why this screen hardcodes rather
 * than keying through `drill.json`.
 */
import { useState } from "react";

import { AppButton, AppText, Card } from "@/learner/ui/primitives";

import type { DrillReason } from "../api/drillClient";
import type { SessionSummary } from "../hooks/useDrillSession";

export interface SessionResultsProps {
  readonly summary: SessionSummary;
  readonly onFinish: () => void;
  readonly testID?: string;
}

/** French Betreuer one-liner — re-serve framing overrides the reason. */
export function betreuerLine(ledWithRedo: boolean, reason: DrillReason): string {
  if (ledWithRedo) {
    return "Tu reviens sur des points que tu avais ratés. C'est comme ça que ça rentre.";
  }
  switch (reason) {
    case "no_gaps_yet":
      return "Un bon début. On apprend à connaître ton niveau.";
    case "review_mode":
      return "Tu consolides ce que tu maîtrises déjà. Continue comme ça.";
    default:
      return "Tu travailles tes points à renforcer. Reviens demain pour la suite.";
  }
}

export function SessionResults({ summary, onFinish, testID }: SessionResultsProps) {
  const [expanded, setExpanded] = useState<string | undefined>(undefined);

  return (
    <div className="flex flex-col gap-6 p-6" data-testid={testID}>
      <AppText size="display" weight="bold" numeric>
        {`${summary.correct} / ${summary.total}`}
      </AppText>

      <AppText size="body" tone="secondary">
        {betreuerLine(summary.ledWithRedo, summary.reason)}
      </AppText>

      {summary.missed.length > 0 ? (
        <div className="flex flex-col gap-2">
          <AppText size="small" weight="semi">
            À revoir
          </AppText>
          {summary.missed.map((m) => (
            <Card key={m.conceptCode} padded>
              <div className="flex items-center justify-between">
                <AppText size="body">{m.conceptName}</AppText>
                <button
                  type="button"
                  onClick={() =>
                    setExpanded((cur) => (cur === m.conceptCode ? undefined : m.conceptCode))
                  }
                  data-testid={testID ? `${testID}-missed-${m.conceptCode}-toggle` : undefined}
                >
                  <AppText size="small" tone="cta">
                    revoir
                  </AppText>
                </button>
              </div>
              {expanded === m.conceptCode ? (
                <AppText size="small" tone="secondary" className="mt-2">
                  {m.explanationFr}
                </AppText>
              ) : null}
            </Card>
          ))}
        </div>
      ) : null}

      <AppButton
        label="Terminer"
        variant="solid"
        onClick={onFinish}
        testID={testID ? `${testID}-finish` : undefined}
      />
    </div>
  );
}
