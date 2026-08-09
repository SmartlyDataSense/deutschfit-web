/**
 * Trimmed `submissions-get` wire client (S3 · Task 3.2).
 *
 * Ports `deutschfit-mobile/src/core/api/submissions.ts`'s type contract,
 * trimmed to the fields this slice's poller reads: `id`, `status`,
 * `kind?`, `failure_reason?`. An index signature keeps the type
 * forward-compatible with the full mobile wire shape (dimension scores,
 * `feedback_json`, board-native headline columns, …) without declaring
 * fields S3 never touches — later slices can widen `RemoteSubmission`
 * without breaking this file. S6 · Task 6.2 is that widening: it adds
 * `DimensionScoreWire`/`DimensionScoresJson` below (additive, no existing
 * member touched) because `WritingSubmission` (`./writing.ts`) needs the
 * wire shape for `dimension_scores_json` and this module is the shared
 * home for `submissions-*` wire types.
 */
import { rawGet } from "./client";

export type SubmissionKind = "writing" | "speaking";

export type SubmissionStatus = "pending" | "grading" | "graded" | "failed";

export interface RemoteSubmission {
  readonly id: string;
  readonly status: SubmissionStatus;
  /**
   * Discriminator returned by `submissions-get`. Older edge deployments
   * may omit it on writing rows; treat absence as writing.
   */
  readonly kind?: SubmissionKind;
  /**
   * Reaper hint (B-REAPER · P7.3, migration 0078) — `'reaper-timeout'`
   * when the backend reaper reaped a `pending` row past its budget.
   */
  readonly failure_reason?: string | null;
  readonly [key: string]: unknown;
}

/**
 * Per-dimension entry in the nested `dimension_scores_json` shape (mirrors
 * `deutschfit-mobile/src/core/api/submissions.ts:41–45` verbatim). Server-
 * derived `pct` (`round(100 * score / max)`) ships alongside the raw score
 * and its `max` so the client can render a donut without recomputing rubric
 * weights. `max` is per-rubric (e.g. 15 for a telc-B2 Schreiben dimension,
 * 25 for Goethe-B1), so it is preserved on the wire rather than assumed.
 */
export type DimensionScoreWire = {
  readonly score: number;
  readonly pct: number;
  readonly max: number;
};

/**
 * `dimension_scores_json` accepts both the legacy flat shape (pre-PR-3 rows)
 * and the nested shape introduced by PR 3. Callers narrow per entry — the
 * legacy shape is `score` only, the new shape carries the server-derived
 * `pct`. Mirrors `deutschfit-mobile/src/core/api/submissions.ts:53–55`.
 */
export type DimensionScoresJson = Record<string, number> | Record<string, DimensionScoreWire>;

/**
 * GET `submissions-get/:id`, optionally hinting the row `kind` to skip
 * the server's writing-first probe. Mirrors mobile's `getSubmission`.
 */
export function getSubmission(id: string, kind?: SubmissionKind): Promise<RemoteSubmission> {
  return rawGet<RemoteSubmission>(
    `submissions-get/${encodeURIComponent(id)}`,
    kind ? { kind } : undefined
  );
}
