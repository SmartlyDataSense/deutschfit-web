/**
 * Skill-bucket classifier for the "Mes points" surface (S9 · Task 9.7).
 * Port of `deutschfit-mobile/src/features/drill/logic/skillBuckets.ts`
 * verbatim.
 *
 * Maps a learner's per-skill BKT mastery estimate onto one of four
 * display buckets. `not_assessed` is checked first: a skill with no
 * attempts has no meaningful mastery estimate regardless of the number.
 *
 * Thresholds are fixed by the design doc §8 — do not tune without a
 * spec update.
 */
export type SkillBucket = "not_assessed" | "renforcer" | "progres" | "maitrise";

/**
 * Display order for grouped bucket sections on the "Mes points" screen.
 * Empty buckets are omitted by the screen, not by this list — this is
 * the full canonical order.
 */
export const BUCKET_ORDER: readonly SkillBucket[] = [
  "renforcer",
  "progres",
  "maitrise",
  "not_assessed",
];

export function classifySkill(attempts: number, mastery: number): SkillBucket {
  if (attempts === 0) {
    return "not_assessed";
  }
  if (mastery < 0.6) {
    return "renforcer";
  }
  if (mastery < 0.8) {
    return "progres";
  }
  return "maitrise";
}
