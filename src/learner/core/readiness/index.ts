/**
 * Public surface of the readiness state-machine store.
 *
 * Mirrors `deutschfit-mobile/src/core/readiness/index.ts`, minus the
 * deprecated `ReadinessSignalV2` export (see `types.ts` doc comment).
 *
 * Producers (Schreiben Editor submit, Sprechen Session submit, push
 * receiver, poll worker, reaper-failed receiver) call:
 *   - `markSubmissionInFlight(submissionId, module)`
 *   - `markCorrectionLong(submissionId)`
 *   - `markCorrectionReady(submissionId)`
 *   - `markSubmissionFailed(submissionId, reason)`
 *
 * Lifecycle terminator:
 *   - `acknowledgeReadiness({ submissionId, module, acknowledgedAt })`
 *     when the learner opens the result screen.
 *
 * Consumers (Accueil Hero, FeedbackScreens) read via
 * `getReadiness()` / `subscribeReadiness(listener)` to drive the
 * founding-doc §8 hero state machine.
 *
 * Single-slot guard:
 *   - `isSubmissionAllowed()` from `./guards.ts` — the Editor /
 *     Session "Soumettre" CTA must consult this before kicking off a
 *     new submit (blocks while a submission is in-flight).
 */
export {
  __hydrateForBoot,
  __resetReadinessForTest,
  __setUserIdResolverForTest,
  acknowledgeReadiness,
  clearReadiness,
  getReadiness,
  markCorrectionLong,
  markCorrectionReady,
  markSubmissionFailed,
  markSubmissionInFlight,
  registerAcknowledgeHook,
  registerReadyHook,
  subscribeReadiness,
} from "./readinessStore";
export type {
  AcknowledgePayload,
  ReadinessFailedReason,
  ReadinessModule,
  ReadinessSignal,
  ReadinessState,
} from "./types";
export {
  isSubmissionAllowed,
  type SubmissionAllowance,
  type SubmissionAllowanceReason,
} from "./guards";
