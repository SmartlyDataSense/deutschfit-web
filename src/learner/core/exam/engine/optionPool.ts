/**
 * Option-pool helper for shared-bank renderers (§6.3).
 *
 * Verbatim port of `deutschfit-mobile/src/core/exam/optionPool.ts`.
 *
 * CLOZE_DRAG gaps and MATCH_TO_ITEM items each carry the full part-level
 * option bank denormalized per item (§5.3). This helper derives, for the
 * item currently on screen, which bank entries are already taken by
 * sibling items — purely presentational; `gradeItem`/`scoreSession`
 * never see consumption.
 *
 * - `consume`: a key is marked consumed iff some OTHER sibling's current
 *   answer equals it. This is a pure projection of `answers` — the helper
 *   holds no state, so a key is "released" whenever the caller's answer-map
 *   no longer points any other sibling at it (e.g. on a whole-part reset).
 * - `reuse`: nothing is ever consumed (CLOZE_RADIO-style fixed options).
 * - `exemptKeys`: keys that are never consumed regardless of picks —
 *   e.g. `["x"]` («Keine passende Anzeige») for Lesen Teil 3.
 */
import type { AnswerMap } from "./scoring";
import type { ExamItem } from "./types";

export type PoolMode = "consume" | "reuse";

export interface PooledOption {
  readonly key: string;
  readonly text: string;
  readonly consumedByOther: boolean;
  readonly exempt: boolean;
}

export function buildOptionPool(
  currentItemId: string,
  siblingItems: readonly ExamItem[],
  answers: AnswerMap,
  mode: PoolMode,
  exemptKeys: readonly string[] = []
): PooledOption[] {
  const current = siblingItems.find((item) => item.id === currentItemId);
  const options = current?.options ?? [];

  const takenByOthers = new Set<string>();
  if (mode === "consume") {
    for (const item of siblingItems) {
      if (item.id === currentItemId) continue;
      const picked = answers[item.id];
      if (picked) takenByOthers.add(picked);
    }
  }

  return options.map((opt) => {
    const exempt = exemptKeys.includes(opt.key);
    return {
      key: opt.key,
      text: opt.text,
      consumedByOther: !exempt && takenByOthers.has(opt.key),
      exempt,
    };
  });
}
