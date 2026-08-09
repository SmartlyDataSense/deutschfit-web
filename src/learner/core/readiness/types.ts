/**
 * Type contract for the readiness state machine.
 *
 * Ports `deutschfit-mobile/src/core/readiness/types.ts` verbatim, minus
 * the deprecated `ReadinessSignalV2` alias — that alias existed only to
 * keep mobile's Wave -1 `src/core/submissions/predicates.ts` stub
 * type-checking during mobile's async-result-experience rollout. The web
 * repo has no such stub debt: its Task 3.2 `predicates.ts` imports
 * `ReadinessSignal` directly.
 *
 * - `ReadinessSignal` is the live shape persisted in `activeSubmission`
 *   (see `src/learner/core/db/schema.ts`) and exposed by
 *   `readinessStore.getReadiness()`.
 * - `AcknowledgePayload` is the input shape `acknowledgeReadiness(...)`
 *   accepts when the learner opens the result screen.
 *
 * Cross-link:
 *   `deutschfit-meta/docs/release/2026-05-07-async-result-plan.md`
 *   §"Parallel-execution DAG".
 */

export type ReadinessModule = "sprechen" | "schreiben";

export type ReadinessState = "in-flight" | "ready" | "failed";

export type ReadinessFailedReason = "grader" | "reaper-timeout" | "network";

export interface ReadinessSignal {
  readonly submissionId: string;
  readonly module: ReadinessModule;
  readonly state: ReadinessState;
  /** True after 90s in `in-flight` — UI surfaces a "still working" hint. */
  readonly slow?: boolean;
  readonly failedReason?: ReadinessFailedReason;
  /** ms epoch — when the submission entered `in-flight`. */
  readonly startedAt: number;
  /** ms epoch — when the learner opened the result screen. */
  readonly acknowledgedAt?: number;
}

export interface AcknowledgePayload {
  readonly submissionId: string;
  readonly module: ReadinessModule;
  readonly acknowledgedAt: number;
}
