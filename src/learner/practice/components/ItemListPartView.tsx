"use client";

/**
 * Part view for one-option-list-per-item formats (§6.2, Task 4.7): MC_SINGLE_*,
 * TRUE_FALSE and MATCH_TO_ITEM. Web port of
 * `deutschfit-mobile/src/features/practice/components/ItemListPartView.tsx`
 * — match items consume from the shared pool (mode "consume") with the
 * «Keine passende Anzeige» key exempt (§6.3, `MATCH_EXEMPT_KEYS`).
 *
 * First-pick locks (§6.4): once `locks[item.id]` exists, every option
 * button for that item gets `data-locked="true"` and is disabled — the
 * verdict is fixed, there's no per-item retry. Reveal styling (success /
 * error tokens) replaces the picked/idle gold treatment once locked.
 * Labels arrive as props — no i18n at block level.
 *
 * Per-item wrapper `role="group"`/`aria-label` (web#60 sweep): only set
 * when `item.stem` is null. When a stem exists, it renders as its own
 * `AppText` a few lines below — pairing `role="group"` with
 * `aria-label={item.stem}` there would duplicate it, since `role="group"`
 * is not children-presentational on web (unlike mobile's `accessible`
 * View): a screen reader would announce the stem as the group's name and
 * then re-read the same `AppText` a second time. When `item.stem` is
 * null (still-scaffolding source), that whole stem row doesn't render at
 * all, so the item number is NOT otherwise visible anywhere in the
 * group — same shape as the do-not-touch `PracticeSessionScreen` /
 * `TopicPickerScreen` groups, where the label is a section identifier
 * that isn't rendered inside the group, so it's kept.
 */
import clsx from "clsx";

import { buildOptionPool } from "@/learner/core/exam/engine/optionPool";
import type { ExamItem, ExamPart } from "@/learner/core/exam/engine/types";
import type { PooledOption } from "@/learner/core/exam/engine/optionPool";
import { AppText } from "@/learner/ui/primitives";

import { locksToAnswerMap } from "@/learner/practice/model/lockState";
import type { LockMap } from "@/learner/practice/model/lockState";

const MATCH_EXEMPT_KEYS = ["x"];

export interface ItemListPartViewProps {
  readonly part: ExamPart;
  readonly locks: LockMap;
  readonly onPick: (item: ExamItem, key: string) => void;
}

interface OptionRowProps {
  readonly itemId: string;
  readonly optKey: string;
  readonly label: string;
  readonly picked: boolean;
  readonly locked: boolean;
  readonly struck: boolean;
  readonly revealCorrect: boolean;
  readonly revealWrong: boolean;
  readonly exempt: boolean;
  readonly onSelect: () => void;
}

function OptionRow({
  itemId,
  optKey,
  label,
  picked,
  locked,
  struck,
  revealCorrect,
  revealWrong,
  exempt,
  onSelect,
}: OptionRowProps) {
  const disabled = locked || struck;
  const badgeFilled = picked && !revealCorrect && !revealWrong;

  return (
    <button
      type="button"
      data-testid={`practice-option-${itemId}-${optKey}`}
      data-locked={locked ? "true" : undefined}
      disabled={disabled}
      onClick={onSelect}
      className={clsx(
        "flex min-h-14 w-full items-center gap-3 rounded-[var(--radius-md)] border px-4 py-3 text-left transition disabled:cursor-not-allowed",
        exempt ? "border-dashed" : "border-solid",
        revealCorrect && "border-success-green bg-success-subtle",
        revealWrong && "border-error-text bg-error-subtle",
        !revealCorrect && !revealWrong && picked && "border-accent-gold bg-accent-gold/15",
        !revealCorrect && !revealWrong && !picked && "border-line-strong bg-bg-card",
        struck && !locked && "opacity-45 line-through",
        !disabled && "hover:opacity-90"
      )}
    >
      <span
        className={clsx(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border",
          badgeFilled ? "border-text-primary bg-text-primary" : "border-line-strong bg-bg-hero"
        )}
      >
        <AppText tone={badgeFilled ? "inverse" : "primary"} size="body" weight="semi" numeric>
          {optKey.toUpperCase()}
        </AppText>
      </span>
      <AppText tone="primary" size="body" weight="medium" className="flex-1">
        {label}
      </AppText>
    </button>
  );
}

export function ItemListPartView({ part, locks, onPick }: ItemListPartViewProps) {
  const answers = locksToAnswerMap(locks);

  return (
    <div className="flex flex-col gap-6">
      {part.items.map((item) => {
        const entry = locks[item.id];
        const locked = entry !== undefined;

        const options: PooledOption[] =
          item.answerFormat === "MATCH_TO_ITEM"
            ? buildOptionPool(item.id, part.items, answers, "consume", MATCH_EXEMPT_KEYS)
            : item.options.map((opt) => ({
                key: opt.key,
                text: opt.text,
                consumedByOther: false,
                exempt: false,
              }));

        return (
          <div
            key={item.id}
            data-testid={`practice-item-${item.id}`}
            className="flex flex-col gap-2"
            role={item.stem ? undefined : "group"}
            aria-label={item.stem ? undefined : `${item.number}`}
          >
            {item.stem ? (
              <div className="flex items-baseline gap-2">
                <AppText tone="secondary" size="small" weight="medium">
                  {`${item.number}.`}
                </AppText>
                <AppText family="serif" size="h3" weight="semi">
                  {item.stem}
                </AppText>
              </div>
            ) : null}
            <div className="flex flex-col gap-2">
              {options.map((opt) => (
                <OptionRow
                  key={opt.key}
                  itemId={item.id}
                  optKey={opt.key}
                  label={opt.text}
                  picked={entry?.key === opt.key}
                  locked={locked}
                  struck={!locked && opt.consumedByOther}
                  revealCorrect={locked && opt.key === item.correctKey}
                  revealWrong={Boolean(locked && entry && !entry.correct && entry.key === opt.key)}
                  exempt={opt.exempt}
                  onSelect={() => onPick(item, opt.key)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
