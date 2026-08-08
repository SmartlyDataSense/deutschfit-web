import { LearnerGuard } from "@/learner/core/auth/LearnerGuard";
import { LearnerNav } from "@/learner/ui/nav/LearnerNav";

/**
 * Auth-gated segment. Every route under `(protected)` renders inside
 * `LearnerGuard` (splash while the session resolves, redirect to
 * `/{locale}/app/login` when unauthenticated, children once
 * authenticated). Routes that must stay reachable without a session —
 * `/app/login` (Task 1.2), `/app/dev/gallery` — are siblings of this
 * segment, not children of it, so they never pass through the gate.
 *
 * `LearnerNav` mounts here (inside the guard, not in the parent
 * `(learner)/app/layout.tsx`) so only authenticated learners ever see
 * navigation chrome (Task 1.3). The `<main>` wrapper offsets content by
 * the responsive nav surface's footprint — bottom padding for `TabBar` on
 * phone/tablet, left padding for `Sidebar` on desktop — via the same
 * `--nav-tabbar-total-height` / `--nav-sidebar-width` tokens the nav
 * components themselves read, so the two can never drift out of sync.
 */
export default function ProtectedLearnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <LearnerGuard>
      <LearnerNav />
      <main className="min-h-screen pb-[var(--nav-tabbar-total-height)] lg:pb-0 lg:pl-[var(--nav-sidebar-width)]">
        {children}
      </main>
    </LearnerGuard>
  );
}
