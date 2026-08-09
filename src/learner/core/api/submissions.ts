/**
 * Trimmed `submissions-get` wire client (S3 · Task 3.2).
 *
 * Ports `deutschfit-mobile/src/core/api/submissions.ts`'s type contract,
 * trimmed to the fields this slice's poller reads: `id`, `status`,
 * `kind?`, `failure_reason?`. An index signature keeps the type
 * forward-compatible with the full mobile wire shape (dimension scores,
 * `feedback_json`, board-native headline columns, …) without declaring
 * fields S3 never touches — later slices can widen `RemoteSubmission`
 * without breaking this file.
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
 * GET `submissions-get/:id`, optionally hinting the row `kind` to skip
 * the server's writing-first probe. Mirrors mobile's `getSubmission`.
 */
export function getSubmission(id: string, kind?: SubmissionKind): Promise<RemoteSubmission> {
  return rawGet<RemoteSubmission>(
    `submissions-get/${encodeURIComponent(id)}`,
    kind ? { kind } : undefined
  );
}
