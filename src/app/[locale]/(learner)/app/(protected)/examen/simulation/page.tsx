"use client";

/**
 * Simulation orchestrator route (Task 8.6). Reads `examSlug` from the
 * query string — the leg screens (Task 8.5) `router.replace` straight back
 * here (`/examen/simulation?examSlug=<slug>`) after every advance, and
 * `ExamHomeScreen`'s resume card / `ModelltestsListScreen`'s row tap both
 * land here on first entry too. `useSearchParams` requires a `<Suspense>`
 * boundary at build time (Next.js App Router), same split as
 * `examen/lesen/session/page.tsx` / `hoeren/session/page.tsx`.
 */
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import { SimulationOrchestratorScreen } from "@/learner/exam/screens/SimulationOrchestratorScreen";

function SimulationOrchestratorPageInner() {
  const params = useSearchParams();
  const examSlug = params.get("examSlug") ?? undefined;

  return <SimulationOrchestratorScreen examSlug={examSlug} />;
}

export default function SimulationOrchestratorPage() {
  return (
    <Suspense fallback={null}>
      <SimulationOrchestratorPageInner />
    </Suspense>
  );
}
