/**
 * Pure scoring helpers. No React, no I/O — safe to test under Node.
 *
 * Verbatim port of `deutschfit-mobile/src/core/exam/scoring.ts`.
 */
import type { ExamItem, ExamPart, ExamSession } from "./types";

/** Picks indexed by item id. `null` means "not answered". */
export type AnswerMap = Readonly<Record<string, string | null>>;

export interface ItemResult {
  readonly itemId: string;
  readonly itemNumber: number;
  readonly picked: string | null;
  readonly correctKey: string;
  readonly isCorrect: boolean;
  readonly isAnswered: boolean;
}

export interface PartResult {
  readonly partId: string;
  readonly teilNumber: number;
  readonly label: string;
  readonly correct: number;
  readonly total: number;
  readonly items: readonly ItemResult[];
}

export interface SessionScore {
  readonly correct: number;
  readonly total: number;
  readonly answered: number;
  readonly unanswered: number;
  /** correct / total, in [0, 1]. `0` when the session has no items. */
  readonly accuracy: number;
  readonly parts: readonly PartResult[];
}

export function gradeItem(item: ExamItem, picked: string | null | undefined): ItemResult {
  const isAnswered = picked !== null && picked !== undefined && picked !== "";
  const safePick = isAnswered ? (picked as string) : null;
  return {
    itemId: item.id,
    itemNumber: item.number,
    picked: safePick,
    correctKey: item.correctKey,
    isAnswered,
    isCorrect: isAnswered && safePick === item.correctKey,
  };
}

export function gradePart(part: ExamPart, answers: AnswerMap): PartResult {
  const items = part.items.map((it) => gradeItem(it, answers[it.id] ?? null));
  return {
    partId: part.id,
    teilNumber: part.teilNumber,
    label: part.label,
    correct: items.filter((r) => r.isCorrect).length,
    total: items.length,
    items,
  };
}

export function scoreSession(session: ExamSession, answers: AnswerMap): SessionScore {
  const parts = session.parts.map((p) => gradePart(p, answers));

  let correct = 0;
  let total = 0;
  let answered = 0;

  for (const p of parts) {
    correct += p.correct;
    total += p.total;
    answered += p.items.filter((i) => i.isAnswered).length;
  }

  return {
    correct,
    total,
    answered,
    unanswered: total - answered,
    accuracy: total === 0 ? 0 : correct / total,
    parts,
  };
}

/** Total item count across all parts. Cheap when you don't need a full grade. */
export function countItems(session: ExamSession): number {
  let total = 0;
  for (const p of session.parts) total += p.items.length;
  return total;
}

/** Items answered (regardless of correctness). Useful for the progress bar. */
export function countAnswered(session: ExamSession, answers: AnswerMap): number {
  let n = 0;
  for (const p of session.parts) {
    for (const it of p.items) {
      const picked = answers[it.id];
      if (picked !== null && picked !== undefined && picked !== "") n += 1;
    }
  }
  return n;
}
