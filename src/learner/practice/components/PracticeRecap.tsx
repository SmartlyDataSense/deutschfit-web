"use client";

/**
 * End-of-session recap (§6.6, Task 4.7): overall score header (gold
 * percentage — scores are the brandGold surface), per-part card with
 * per-item ✓/✗ verdict pills, whole-part «Recommencer», back-to-hub
 * button. No submission/attempt row — practice ends here. Web port of
 * `deutschfit-mobile/src/features/practice/components/PracticeRecap.tsx`.
 * Labels arrive as props — no i18n at block level.
 */
import clsx from "clsx";

import { Icon } from "@/learner/core/icons/Icon";
import type { ExamPart } from "@/learner/core/exam/engine/types";
import { AppButton, AppText, Card } from "@/learner/ui/primitives";

import { partProgress } from "@/learner/practice/model/lockState";
import type { LockMap } from "@/learner/practice/model/lockState";

export interface PracticeRecapProps {
  readonly parts: readonly ExamPart[];
  readonly locks: LockMap;
  readonly title: string;
  readonly scoreLabel: (correct: number, total: number) => string;
  readonly restartLabel: string;
  readonly backLabel: string;
  readonly onRestartPart: (part: ExamPart) => void;
  readonly onBackToHub: () => void;
}

export function PracticeRecap({
  parts,
  locks,
  title,
  scoreLabel,
  restartLabel,
  backLabel,
  onRestartPart,
  onBackToHub,
}: PracticeRecapProps) {
  let totalCorrect = 0;
  let totalCount = 0;
  for (const part of parts) {
    const progress = partProgress(locks, part);
    totalCorrect += progress.correct;
    totalCount += progress.total;
  }
  const pct = totalCount ? Math.round((totalCorrect / totalCount) * 100) : 0;

  return (
    <div data-testid="practice-recap" className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-1 py-4">
        <AppText as="h1" family="serif" size="h1" weight="bold" align="center">
          {title}
        </AppText>
        <AppText family="serif" size="display" weight="bold" tone="gold" align="center">
          {`${pct}%`}
        </AppText>
        <AppText tone="secondary" align="center" testID="practice-recap-score">
          {scoreLabel(totalCorrect, totalCount)}
        </AppText>
      </div>

      {parts.map((part) => {
        const progress = partProgress(locks, part);
        return (
          <Card
            key={part.id}
            testID={`practice-recap-part-${part.id}`}
            className="flex flex-col gap-2 border border-line-soft"
          >
            <AppText family="serif" size="h3" weight="semi">
              {part.label}
            </AppText>
            <AppText tone="secondary" size="small">
              {scoreLabel(progress.correct, progress.total)}
            </AppText>
            <div className="flex flex-wrap gap-2">
              {part.items.map((item) => {
                const entry = locks[item.id];
                const correct = entry?.correct === true;
                return (
                  <span
                    key={item.id}
                    className={clsx(
                      "inline-flex items-center gap-1 rounded-[var(--radius-full)] px-3 py-0.5",
                      correct ? "bg-success-subtle" : "bg-error-subtle"
                    )}
                  >
                    <Icon name={correct ? "check" : "close"} size={14} />
                    <AppText
                      size="caption"
                      weight="medium"
                      className={correct ? "text-success-text" : "text-error-text"}
                    >
                      {`${item.number}.`}
                    </AppText>
                  </span>
                );
              })}
            </div>
            <button
              type="button"
              data-testid={`practice-recap-restart-${part.id}`}
              onClick={() => onRestartPart(part)}
              className="min-h-11 self-start"
            >
              <AppText tone="cta" size="small" weight="semi">
                {restartLabel}
              </AppText>
            </button>
          </Card>
        );
      })}

      <AppButton
        testID="practice-recap-back"
        variant="solid"
        label={backLabel}
        onClick={onBackToHub}
      />
    </div>
  );
}
