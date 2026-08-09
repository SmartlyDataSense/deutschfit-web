/**
 * Hub progress chips (§6.5): «✓ Terminé» / «En cours n/m» / «À faire»,
 * derived from the persisted `practice_progress` row (or its absence).
 *
 * Verbatim port of
 * `deutschfit-mobile/src/features/practice/model/progressChip.ts`.
 */
export type PracticeChip =
  | { readonly state: "done" }
  | {
      readonly state: "inProgress";
      readonly locked: number;
      readonly total: number;
    }
  | { readonly state: "todo" };

export interface ChipSource {
  readonly lockedCount: number;
  readonly totalCount: number;
  readonly completedAt: number | null;
}

export function deriveChip(source: ChipSource | null | undefined): PracticeChip {
  if (!source || source.lockedCount === 0) {
    return { state: "todo" };
  }
  if (source.completedAt !== null) {
    return { state: "done" };
  }
  return {
    state: "inProgress",
    locked: source.lockedCount,
    total: source.totalCount,
  };
}
