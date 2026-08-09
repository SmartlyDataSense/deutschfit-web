"use client";
import { LearnerGuard } from "@/learner/core/auth/LearnerGuard";

/**
 * Onboarding segment shell — auth-guarded but OUTSIDE `(protected)`, so no
 * `LearnerNav` chrome and no `OnboardingGate` (which would be circular).
 * Phone-fidelity centered column at every breakpoint (spec §3).
 */
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <LearnerGuard>
      <main
        data-testid="onboarding-shell"
        className="mx-auto flex min-h-screen w-full max-w-md flex-col px-6 pt-4 pb-6"
      >
        {children}
      </main>
    </LearnerGuard>
  );
}
