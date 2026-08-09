/**
 * Board-result presentation discriminator — pure, dependency-free.
 *
 * Lives apart from `examApi`/`writing` on purpose: this must stay a pure
 * total function over `score_max`, safe to import anywhere — including the
 * `@/learner/ui/blocks` layout layer — without pulling in Supabase client
 * wiring as an import side-effect.
 *
 * Ported verbatim from `deutschfit-mobile/src/core/api/resultType.ts:17-35`.
 */

/**
 * `points` — the board scores the module on a numeric denominator (telc
 * points, Goethe /100): render the scorecard with `score / score_max`.
 * `band` — no numeric denominator (TestDaF TDN): keep the legacy
 * donut/percentage rendering.
 */
export type ResultType = "points" | "band";

/**
 * Derive the board-result presentation mode from `score_max`.
 *
 * `result_type` is intentionally not persisted (migration 0119): a board with
 * a numeric denominator (`score_max` a positive finite number) renders the
 * points scorecard; everything else (null/undefined on legacy + band rows, or
 * a meaningless non-positive denominator) falls back to the donut path.
 */
export function resultTypeFromScoreMax(scoreMax: number | null | undefined): ResultType {
  return typeof scoreMax === "number" && Number.isFinite(scoreMax) && scoreMax > 0
    ? "points"
    : "band";
}
