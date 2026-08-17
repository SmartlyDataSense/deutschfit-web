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
 * Copy was hardcoded FR at first port (task-9.6-brief.md Step 5,
 * `betreuerLine` included, byte-for-byte from mobile). Routed through
 * `drill:session.*` in task 8 (#39) — the French had already shipped and
 * already passed brand voice; only the English side was missing, which
 * was translation, not new copy.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { AppButton, AppText, Card } from "@/learner/ui/primitives";

import type { DrillReason } from "../api/drillClient";
import type { SessionSummary } from "../hooks/useDrillSession";

export interface SessionResultsProps {
  readonly summary: SessionSummary;
  readonly onFinish: () => void;
  readonly testID?: string;
}

/** Betreuer one-liner, keyed off `drill:session.betreuerLine.*` — re-serve framing overrides the reason. */
export function betreuerLine(
  ledWithRedo: boolean,
  reason: DrillReason,
  t: (key: string) => string
): string {
  if (ledWithRedo) {
    return t("drill:session.betreuerLine.ledWithRedo");
  }
  switch (reason) {
    case "no_gaps_yet":
      return t("drill:session.betreuerLine.noGapsYet");
    case "review_mode":
      return t("drill:session.betreuerLine.reviewMode");
    default:
      return t("drill:session.betreuerLine.default");
  }
}

export function SessionResults({ summary, onFinish, testID }: SessionResultsProps) {
  const { t } = useTranslation(["drill"]);
  const [expanded, setExpanded] = useState<string | undefined>(undefined);

  return (
    <div className="flex flex-col gap-6 p-6" data-testid={testID}>
      <AppText size="display" weight="bold" numeric>
        {`${summary.correct} / ${summary.total}`}
      </AppText>

      <AppText size="body" tone="secondary">
        {betreuerLine(summary.ledWithRedo, summary.reason, t)}
      </AppText>

      {summary.missed.length > 0 ? (
        <div className="flex flex-col gap-2">
          <AppText size="small" weight="semi">
            {t("drill:session.toReview")}
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
                    {t("drill:session.reviewToggle")}
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
        label={t("drill:session.finish")}
        variant="solid"
        onClick={onFinish}
        testID={testID ? `${testID}-finish` : undefined}
      />
    </div>
  );
}
