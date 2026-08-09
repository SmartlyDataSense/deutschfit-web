/**
 * Single-slot submission guard.
 *
 * Verbatim port of `deutschfit-mobile/src/core/readiness/guards.ts`.
 *
 * The async-result-experience contract (founding-doc §8 + plan
 * 2026-05-07) states that a learner can only have one in-flight
 * submission at a time. The Editor / Session "Soumettre" CTA must
 * consult this guard before kicking off a new submit so we never
 * stack two graders, two pushes, two reapers — and so the post-session
 * Hero pulse is unambiguous.
 *
 * Policy:
 *   - Slot empty                       → allowed
 *   - Slot in `ready` or `failed`      → allowed (the previous result
 *     is awaiting acknowledgement; the new submit will replace it once
 *     the learner taps the post-session CTA, which calls
 *     `acknowledgeReadiness(...)` first)
 *   - Slot in `in-flight`              → blocked, reason `in-flight-exists`
 *
 * Returning a structured `{ allowed, reason }` (rather than a plain
 * boolean) lets the call-site surface a brand-voice-correct toast
 * without us hard-coding French copy in core.
 */
import { getReadiness } from "./readinessStore";

export type SubmissionAllowanceReason = "in-flight-exists";

export interface SubmissionAllowance {
  readonly allowed: boolean;
  readonly reason?: SubmissionAllowanceReason;
}

export function isSubmissionAllowed(): SubmissionAllowance {
  const slot = getReadiness();
  if (slot && slot.state === "in-flight") {
    return { allowed: false, reason: "in-flight-exists" };
  }
  return { allowed: true };
}
