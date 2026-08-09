"use client";

/**
 * Graded Lesen session route (Task 4.9). Reads `examSlug` /
 * `mockAttemptId` / `attemptId` / `moduleFilter` from the query string —
 * the exact param contract `LesenIntroScreen`'s `handleStart` builds
 * (`.../session?examSlug=...&mockAttemptId=...&attemptId=...&moduleFilter=LESEN`).
 * `useSearchParams` requires a `<Suspense>` boundary at build time (Next.js
 * App Router), same split as `app/onboarding/diagnostic/page.tsx`.
 */
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import { LesenSessionScreen } from "@/learner/lesen/screens/LesenSessionScreen";

function LesenSessionPageInner() {
  const params = useSearchParams();
  const examSlug = params.get("examSlug") ?? undefined;
  const attemptId = params.get("attemptId") ?? undefined;
  const mockAttemptId = params.get("mockAttemptId") ?? undefined;
  const moduleFilter = params.get("moduleFilter") ?? undefined;

  return (
    <LesenSessionScreen
      examSlug={examSlug}
      attemptId={attemptId}
      mockAttemptId={mockAttemptId}
      moduleFilter={moduleFilter}
    />
  );
}

export default function LesenSessionPage() {
  return (
    <Suspense fallback={null}>
      <LesenSessionPageInner />
    </Suspense>
  );
}
