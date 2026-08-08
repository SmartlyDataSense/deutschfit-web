import { LearnerGuard } from "@/learner/core/auth/LearnerGuard";

/**
 * Auth-gated segment. Every route under `(protected)` renders inside
 * `LearnerGuard` (splash while the session resolves, redirect to
 * `/{locale}/app/login` when unauthenticated, children once
 * authenticated). Routes that must stay reachable without a session —
 * `/app/login` (Task 1.2), `/app/dev/gallery` — are siblings of this
 * segment, not children of it, so they never pass through the gate.
 */
export default function ProtectedLearnerLayout({ children }: { children: React.ReactNode }) {
  return <LearnerGuard>{children}</LearnerGuard>;
}
