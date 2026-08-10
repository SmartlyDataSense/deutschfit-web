"use client";

/**
 * `DrillCard` — renders a single connector-cloze drill card (S9 · Task
 * 9.5). Ports
 * `deutschfit-mobile/src/features/coach/components/DrillCard.tsx`:
 *
 *   - Overline: "Drill · connecteur".
 *   - Sentence: serif body with the blank highlighted in coach-teal.
 *   - Options row: pressable option chips. Once an option is picked,
 *     the card locks — the correct pick highlights success-green, a
 *     wrong pick highlights warning-red, and the correct answer is
 *     revealed in success-green if the learner missed it.
 *   - Explanation pane: shown after the learner answers.
 *
 * The Continue/Terminer CTA lives outside the card (owned by the
 * screen) so the card stays dumb w.r.t. chain navigation — same split
 * as mobile.
 */
import { AppText, Card } from "@/learner/ui/primitives";

export interface DrillCardProps {
  readonly overlineLabel: string;
  readonly before: string;
  readonly after: string;
  readonly options: readonly string[];
  /** The correct answer — revealed once the learner locks in a pick. */
  readonly answer: string;
  /** Selected option, if any. `undefined` means the card is still open. */
  readonly selected?: string;
  readonly onSelect: (option: string) => void;
  readonly explanation: string;
  readonly explanationLabel: string;
  readonly optionA11yPrefix: string;
  readonly testID?: string;
}

export function DrillCard({
  overlineLabel,
  before,
  after,
  options,
  answer,
  selected,
  onSelect,
  explanation,
  explanationLabel,
  optionA11yPrefix,
  testID,
}: DrillCardProps) {
  const locked = selected !== undefined;

  return (
    <Card testID={testID} className="flex flex-col gap-2">
      <AppText tone="coach" size="caption" weight="semi" className="uppercase tracking-wide">
        {overlineLabel}
      </AppText>

      <AppText family="serif" size="h3" weight="semi" className="mt-1">
        {before}
        <AppText as="span" family="serif" size="h3" weight="semi" tone="coach">
          {"  ____  "}
        </AppText>
        {after}
      </AppText>

      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((opt) => {
          const isPicked = selected === opt;
          const isAnswer = opt === answer;
          let stateClasses = "border-line-strong bg-bg-hero";
          let tone: "primary" | "success" | "warning" = "primary";
          if (locked) {
            if (isPicked && isAnswer) {
              stateClasses = "border-success-green bg-bg-card";
              tone = "success";
            } else if (isPicked && !isAnswer) {
              stateClasses = "border-warning-red bg-bg-card";
              tone = "warning";
            } else if (isAnswer) {
              stateClasses = "border-success-green bg-bg-card";
              tone = "success";
            } else {
              stateClasses = "border-line-strong bg-bg-hero opacity-50";
              tone = "primary";
            }
          }
          return (
            <button
              key={opt}
              type="button"
              onClick={() => {
                if (!locked) onSelect(opt);
              }}
              disabled={locked}
              aria-label={`${optionA11yPrefix} ${opt}`}
              aria-pressed={isPicked}
              data-testid={`drill-option-${opt}`}
              className={`rounded-[var(--radius-full)] border px-4 py-2 transition disabled:cursor-not-allowed ${
                !locked ? "hover:bg-cream-deep" : ""
              } ${stateClasses}`}
            >
              <AppText as="span" family="serif" size="body" weight="semi" tone={tone}>
                {opt}
              </AppText>
            </button>
          );
        })}
      </div>

      {locked ? (
        <div className="mt-3 border-t border-line-soft pt-3" data-testid="drill-explanation">
          <AppText
            tone="secondary"
            size="caption"
            weight="semi"
            className="uppercase tracking-wide"
          >
            {explanationLabel}
          </AppText>
          <AppText tone="primary" size="body" className="mt-1">
            {explanation}
          </AppText>
        </div>
      ) : null}
    </Card>
  );
}
