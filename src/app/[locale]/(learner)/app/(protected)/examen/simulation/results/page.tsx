"use client";

import { SimulationResultsScreen } from "@/learner/exam/screens/SimulationResultsScreen";

/**
 * Simulation results route (Task 8.8). No `useSearchParams` — the screen
 * reads `useSimulationRun` (P10), so no `Suspense` boundary is required
 * here, same shape as `examen/lesen/results/page.tsx`.
 */
export default function SimulationResultsPage() {
  return <SimulationResultsScreen />;
}
