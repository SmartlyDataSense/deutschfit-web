"use client";

/**
 * Hören session route (Task 5.7). Reads `attemptId` / `examSlug` /
 * `mockAttemptId` / `moduleFilter` / `slug` from the query string — same
 * param contract as the graded Lesen session route
 * (`app/(protected)/examen/lesen/session/page.tsx`, S4 Task 4.9), plus the
 * practice-set picker's `slug` (Task 5.5's `[modality]/session` redirect
 * lands here for `modality === "hoeren"`: `/hoeren/session?slug=...`).
 * `useSearchParams` requires a `<Suspense>` boundary at build time (Next.js
 * App Router), same split as `examen/lesen/session/page.tsx`.
 */
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import { HoerenSessionScreen } from "@/learner/hoeren/screens/HoerenSessionScreen";

function HoerenSessionPageInner() {
  const params = useSearchParams();
  const attemptId = params.get("attemptId") ?? undefined;
  const examSlug = params.get("examSlug") ?? undefined;
  const mockAttemptId = params.get("mockAttemptId") ?? undefined;
  const moduleFilter = params.get("moduleFilter") ?? undefined;
  const slug = params.get("slug") ?? undefined;

  return (
    <HoerenSessionScreen
      attemptId={attemptId}
      examSlug={examSlug}
      mockAttemptId={mockAttemptId}
      moduleFilter={moduleFilter}
      slug={slug}
    />
  );
}

export default function HoerenSessionPage() {
  return (
    <Suspense fallback={null}>
      <HoerenSessionPageInner />
    </Suspense>
  );
}
