"use client";

import { HoerenResultsScreen } from "@/learner/hoeren/screens/HoerenResultsScreen";

/**
 * Hören results route (Task 5.8), shared between the practice and graded
 * flows (P9). No `useSearchParams` — the screen reads
 * `useHoerenResultsStore`, same `Suspense`-free shape as
 * `examen/lesen/results/page.tsx` (S4 Task 4.9).
 */
export default function HoerenResultsPage() {
  return <HoerenResultsScreen />;
}
