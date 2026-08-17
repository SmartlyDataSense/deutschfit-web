"use client";

/**
 * `SessionMcqCard` — one 3-option MCQ inside the adaptive drill session
 * (System A — S9 · Task 9.6). Web port of
 * `deutschfit-mobile/src/features/drill/components/SessionMcqCard.tsx`
 * onto `@/learner/ui/primitives`.
 *
 * Copy was hardcoded FR at first port (task-9.6-brief.md Step 5, mirroring
 * mobile byte-for-byte). Routed through `drill:session.*` in task 8 (#39)
 * — the French had already shipped and already passed brand voice; only
 * the English side was missing, which was translation, not new copy.
 *
 * Before an answer: a serif cloze sentence (`before ____ after`) with
 * three radio-style options. After a pick (`selected`, set by the
 * parent): each option resolves correct ✓ / incorrect ✕, an
 * explanation panel slides in with `explanation_fr`, and the continue
 * label advances the session.
 */
import clsx from "clsx";
import { useTranslation } from "react-i18next";

import { AppButton, AppText, Card } from "@/learner/ui/primitives";

import type { SessionItem } from "../hooks/useDrillSession";

export interface SessionMcqCardProps {
  readonly item: SessionItem;
  readonly selected: string | undefined;
  readonly onSelect: (option: string) => void;
  readonly onContinue: () => void;
  readonly testID?: string;
}

export function SessionMcqCard({
  item,
  selected,
  onSelect,
  onContinue,
  testID,
}: SessionMcqCardProps) {
  const { t } = useTranslation(["drill"]);
  const revealed = selected !== undefined;

  return (
    <div className="flex flex-col gap-4" data-testid={testID}>
      <Card padded elevated>
        <AppText size="bodyLg" family="serif">
          {`${item.before_de} ____ ${item.after_de}`}
        </AppText>

        <div className="mt-4 flex flex-col gap-2" role="radiogroup">
          {item.options.map((option) => {
            const isAnswer = option === item.answer_de;
            const isChosen = option === selected;
            const dotClass = !revealed
              ? "border-line-strong"
              : isAnswer
                ? "border-success-green"
                : isChosen
                  ? "border-warning-red"
                  : "border-line-strong";
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={isChosen}
                disabled={revealed}
                onClick={() => onSelect(option)}
                data-testid={testID ? `${testID}-option-${option}` : undefined}
                className="flex items-center gap-2 py-2 text-left disabled:cursor-not-allowed"
              >
                <span
                  aria-hidden="true"
                  className={clsx(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius-full)] border-2",
                    dotClass
                  )}
                >
                  {revealed && isAnswer ? (
                    <AppText as="span" size="caption" tone="success">
                      ✓
                    </AppText>
                  ) : revealed && isChosen ? (
                    <AppText as="span" size="caption" tone="warning">
                      ✕
                    </AppText>
                  ) : null}
                </span>
                <AppText size="body">{option}</AppText>
              </button>
            );
          })}
        </div>
      </Card>

      {revealed ? (
        <div className="flex flex-col gap-4 rounded-[var(--radius-md)] bg-bg-premium p-4">
          <AppText size="small" tone="inverse">
            {item.explanation_fr}
          </AppText>
          <AppButton
            label={t("drill:session.continue")}
            variant="solid"
            onClick={onContinue}
            testID={testID ? `${testID}-continue` : undefined}
          />
        </div>
      ) : null}
    </div>
  );
}
