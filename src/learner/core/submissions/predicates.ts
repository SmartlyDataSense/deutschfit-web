import type { ReadinessSignal } from "@/learner/core/readiness";

/**
 * Local shim for the push deep-link payload shape. Mobile's
 * `PushDeepLinkPayload` lives in `../notifications/types` (owned by
 * M-NOTIF); the web repo hasn't ported the notifications module yet
 * (tracked for S12), so this predicate declares the minimal shape it
 * actually reads. Drop this shim once S12 ports the real type and
 * import it from there instead.
 */
export interface PushDeepLinkPayload {
  readonly kind: string;
  readonly submissionId?: string;
}

/**
 * Returns true when an incoming push payload references a submission
 * that is no longer the learner's active slot.
 *
 * Ports `deutschfit-mobile/src/core/submissions/predicates.ts`.
 *
 * Definition (M-POLL Wave 1, async-result-experience plan §P5):
 * a `submission_id` is "stale" if it does not match the current active
 * slot in the readiness store. Concretely:
 *
 *   - `grading_ready` payload + active slot exists with same
 *     `submissionId` → NOT stale (the live correction).
 *   - `grading_ready` payload + active slot exists with a DIFFERENT
 *     `submissionId` → stale (a retry replaced the original, or a
 *     reaper push arrived after the row turned terminal and the user
 *     already kicked off another submit).
 *   - `grading_ready` payload + NO active slot → stale (the slot was
 *     already acknowledged or cleared, so the push is referring to a
 *     submission the learner has moved past).
 *   - Non-`grading_ready` payloads (e.g. `coach_reply`) → not stale by
 *     definition; the predicate is only meaningful for grading-ready
 *     deep links. The push handler is expected to short-circuit before
 *     us (S12), but we keep this branch defensive so a future caller
 *     can pass any payload without surprises.
 */
export function isStaleSubmission(
  payload: PushDeepLinkPayload,
  activeSlot: ReadinessSignal | null
): boolean {
  if (payload.kind !== "grading_ready") {
    // Predicate only applies to grading-ready deep links. Any other
    // kind (coach_reply, future kinds) is by construction not stale.
    return false;
  }
  if (activeSlot === null) {
    // No active slot — the learner has acknowledged or cleared the
    // previous correction. A `grading_ready` push for a submission
    // that's no longer tracked is a late echo; drop it.
    return true;
  }
  // Active slot exists — stale iff the submission ids diverge.
  return activeSlot.submissionId !== payload.submissionId;
}
