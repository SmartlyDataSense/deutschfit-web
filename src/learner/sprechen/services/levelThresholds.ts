/**
 * `levelThresholds` — target monologue duration by `(subgenre, level)`
 * (S7 · Task 7.4).
 *
 * Verbatim port of
 * `deutschfit-mobile/src/features/sprechen/services/levelThresholds.ts`
 * (45L). The Sprechen length-warning soft-confirm in the review phase
 * (#373) computes `actualSec / targetSec` to decide whether to show the
 * short-recording note (fires when `actualSec < 0.5 * targetSec`). Mobile
 * + backend share the same canonical numbers — keep this table in sync
 * with `_shared/level_thresholds_monologue.ts` on the backend.
 *
 * Wave 2 ships two active subgenres:
 *   - `praesentation` (B1)  → 180 s (~3 minutes)
 *   - `vortrag`       (B2)  → 240 s (~4 minutes)
 *
 * The other subgenres (`referat`, `bildbeschreibung`, `erzaehlung`) are
 * not offered by the picker until their catalogs are seeded. We still
 * return a sensible default (180 s) for them so any unexpected call site
 * won't crash on `undefined`.
 */

const DEFAULT_TARGET_SEC = 180;

/**
 * Target monologue duration in seconds for a given `(subgenre, level)`
 * pair. Used by the review phase's length-warning soft-confirm and by any
 * future analytics that needs to bucket recordings by completeness.
 *
 * Loosely typed (`string | undefined`) rather than the narrow picker
 * unions — mirrors mobile's call sites, which pass optional picker state
 * straight through without narrowing first.
 */
export function getMonologueTargetSec(
  subgenre: string | undefined,
  level: string | undefined
): number {
  if (subgenre === "praesentation" && level === "B1") return 180;
  if (subgenre === "vortrag" && level === "B2") return 240;
  // Catch-all: B1 defaults to 180 s, B2 to 240 s, anything else 180 s.
  if (level === "B2") return 240;
  if (level === "B1") return 180;
  return DEFAULT_TARGET_SEC;
}

/**
 * Length-warning threshold ratio. The review phase shows the short-note
 * when `actualSec < SHORT_RECORDING_RATIO * targetSec`.
 */
export const SHORT_RECORDING_RATIO = 0.5;
