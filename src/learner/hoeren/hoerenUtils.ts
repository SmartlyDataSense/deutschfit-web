/**
 * Pure utilities for the Hören feature.
 *
 * Verbatim port of `deutschfit-mobile/src/features/hoeren/hoerenUtils.ts`.
 * Kept in a separate module so it can be imported without pulling in the
 * hook's React dependency graph.
 */

/**
 * Converts a lowercase exam-context level to its display form and builds
 * the Hören results label. The hook delegates to this inside a `useMemo`.
 *
 * @example
 * computeHoerenLevelLabels("b2")
 * // → { displayLevel: "B2", examLabel: "Hören · B2" }
 */
export function computeHoerenLevelLabels(level: string): {
  displayLevel: string;
  examLabel: string;
} {
  const displayLevel = level.toUpperCase();
  return { displayLevel, examLabel: `Hören · ${displayLevel}` };
}
