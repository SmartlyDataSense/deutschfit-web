"use client";

import { LesenResultsScreen } from "@/learner/lesen/screens/LesenResultsScreen";

/**
 * Graded Lesen results route (Task 4.9). No `useSearchParams` — the
 * screen reads `useLesenResultsStore` (P7), so no `Suspense` boundary is
 * required here.
 */
export default function LesenResultsPage() {
  return <LesenResultsScreen />;
}
