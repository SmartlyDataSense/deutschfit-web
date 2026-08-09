"use client";

/**
 * Part view for the cloze formats (§5.3/§6.2, Task 4.7). Renders the gapped
 * paragraph ONCE (canonical `{{n}}` tokens with n === item.number) as
 * tappable inline gap chips. Pool mode follows the format: CLOZE_DRAG
 * consumes from the shared bank (denormalized per gap), CLOZE_RADIO reuses
 * each gap's own fixed options.
 *
 * Web adaptation from `deutschfit-mobile/src/features/practice/components/
 * ClozePartView.tsx` (documented deviation, not an oversight): mobile opens
 * a `WordPickerSheet` bottom sheet per gap; there is no sheet primitive on
 * web, so the picker renders as an inline option list directly under the
 * gapped paragraph instead — same pool semantics (`buildOptionPool`,
 * consume/reuse modes), same "closes after the first pick" first-pick-lock
 * behaviour. Labels arrive as props — no i18n at block level.
 */
import { useState } from "react";
import clsx from "clsx";

import { buildOptionPool } from "@/learner/core/exam/engine/optionPool";
import type { ExamItem, ExamPart } from "@/learner/core/exam/engine/types";
import { AppText, Card } from "@/learner/ui/primitives";

import { locksToAnswerMap } from "@/learner/practice/model/lockState";
import type { LockMap } from "@/learner/practice/model/lockState";

export interface ClozePartViewProps {
  readonly part: ExamPart;
  readonly readingText: string;
  readonly locks: LockMap;
  readonly pickerTitle: string;
  readonly onPick: (item: ExamItem, key: string) => void;
}

type ClozeSegment =
  | { readonly kind: "text"; readonly value: string }
  | { readonly kind: "gap"; readonly number: number };

function parseClozeSegments(text: string): ClozeSegment[] {
  const segments: ClozeSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(/\{\{(\d+)\}\}/g)) {
    const index = match.index ?? 0;
    const raw = match[1];
    if (raw === undefined) continue;
    if (index > cursor) {
      segments.push({ kind: "text", value: text.slice(cursor, index) });
    }
    segments.push({ kind: "gap", number: Number(raw) });
    cursor = index + match[0].length;
  }
  if (cursor < text.length) {
    segments.push({ kind: "text", value: text.slice(cursor) });
  }
  return segments;
}

function optionText(item: ExamItem, key: string): string | null {
  return item.options.find((option) => option.key === key)?.text ?? null;
}

type GapStatus = "empty" | "correct" | "incorrect";

const GAP_CLASS: Record<GapStatus, string> = {
  empty: "text-accent-gold",
  correct: "text-success-text",
  incorrect: "text-error-text",
};

export function ClozePartView({
  part,
  readingText,
  locks,
  pickerTitle,
  onPick,
}: ClozePartViewProps) {
  const [activeItemId, setActiveItemId] = useState<string | null>(null);

  const itemByNumber: Record<number, ExamItem> = {};
  for (const item of part.items) {
    itemByNumber[item.number] = item;
  }

  const activeItem = part.items.find((item) => item.id === activeItemId) ?? null;
  const mode = activeItem?.answerFormat === "CLOZE_DRAG" ? "consume" : "reuse";
  const pool = activeItem
    ? buildOptionPool(activeItem.id, part.items, locksToAnswerMap(locks), mode)
    : [];

  const segments = parseClozeSegments(readingText);

  return (
    <div className="flex flex-col gap-4">
      <Card testID="practice-cloze-text">
        <AppText tone="primary" size="body" as="p">
          {segments.map((segment, i) => {
            if (segment.kind === "text") {
              return <span key={`t-${i}`}>{segment.value}</span>;
            }
            const item = itemByNumber[segment.number];
            const entry = item ? locks[item.id] : undefined;
            const locked = entry !== undefined;
            const status: GapStatus = entry ? (entry.correct ? "correct" : "incorrect") : "empty";
            const display =
              entry && item
                ? (optionText(item, entry.key) ?? `(${segment.number})`)
                : `(${segment.number}) ____`;

            return (
              <button
                key={`g-${i}`}
                type="button"
                data-testid={item ? `practice-gap-${item.id}` : undefined}
                data-locked={locked ? "true" : undefined}
                disabled={locked || !item}
                onClick={() => item && setActiveItemId(item.id)}
                className={clsx(
                  "mx-0.5 inline underline decoration-dotted underline-offset-2 disabled:cursor-not-allowed",
                  GAP_CLASS[status]
                )}
              >
                {display}
              </button>
            );
          })}
        </AppText>
      </Card>

      {activeItem ? (
        <Card testID={`practice-picker-${activeItem.id}`} className="flex flex-col gap-3">
          <AppText tone="secondary" size="small" weight="semi">
            {pickerTitle}
          </AppText>
          <div className="flex flex-col gap-2">
            {pool.map((opt) => (
              <button
                key={opt.key}
                type="button"
                data-testid={`practice-option-${activeItem.id}-${opt.key}`}
                disabled={opt.consumedByOther}
                onClick={() => {
                  onPick(activeItem, opt.key);
                  setActiveItemId(null);
                }}
                className={clsx(
                  "min-h-11 rounded-[var(--radius-md)] border border-line-strong bg-bg-card px-4 py-2 text-left transition disabled:cursor-not-allowed",
                  opt.consumedByOther ? "opacity-45 line-through" : "hover:opacity-90"
                )}
              >
                <AppText tone="primary" size="body" weight="medium">
                  {opt.text}
                </AppText>
              </button>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
