/**
 * First-pick lock semantics (§6.4). The first selection on an item locks
 * it — `gradeItem` runs exactly once and the verdict is stored; there is
 * no per-item retry. Re-attempt is whole-part only («Recommencer» →
 * `resetPart`). Pure functions over a readonly map so hooks can persist by
 * identity comparison.
 *
 * Verbatim port of
 * `deutschfit-mobile/src/features/practice/model/lockState.ts`, with one
 * delta: mobile's `gradeItem` (`core/exam/scoring.ts`) is called the same
 * way, but this repo's exam engine (Task 4.2,
 * `core/exam/engine/scoring.ts`) returns a full `ItemResult` object rather
 * than a boolean-shaped verdict — `lockPick` reads `.isCorrect` off it.
 */
import { gradeItem } from "@/learner/core/exam/engine/scoring";
import type { AnswerMap } from "@/learner/core/exam/engine/scoring";
import type { ExamItem, ExamPart, ExamSession } from "@/learner/core/exam/engine/types";
import type { PracticeAnswerEntry } from "@/learner/core/db/types";

export type LockMap = Readonly<Record<string, PracticeAnswerEntry>>;

export function lockPick(locks: LockMap, item: ExamItem, pickedKey: string): LockMap {
  if (locks[item.id]) {
    return locks;
  }
  const verdict = gradeItem(item, pickedKey);
  return {
    ...locks,
    [item.id]: { key: pickedKey, correct: verdict.isCorrect },
  };
}

export function resetPart(locks: LockMap, part: ExamPart): LockMap {
  const next: Record<string, PracticeAnswerEntry> = { ...locks };
  for (const item of part.items) {
    delete next[item.id];
  }
  return next;
}

export function partProgress(
  locks: LockMap,
  part: ExamPart
): { locked: number; correct: number; total: number } {
  let locked = 0;
  let correct = 0;
  for (const item of part.items) {
    const entry = locks[item.id];
    if (entry) {
      locked += 1;
      if (entry.correct) correct += 1;
    }
  }
  return { locked, correct, total: part.items.length };
}

export function isSessionComplete(locks: LockMap, session: ExamSession): boolean {
  return session.parts.every((part) => part.items.every((item) => locks[item.id] !== undefined));
}

export function locksToAnswerMap(locks: LockMap): AnswerMap {
  const map: Record<string, string | null> = {};
  for (const [itemId, entry] of Object.entries(locks)) {
    map[itemId] = entry.key;
  }
  return map;
}
