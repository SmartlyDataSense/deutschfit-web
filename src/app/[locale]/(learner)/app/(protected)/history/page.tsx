"use client";

import { PerformanceHistoryScreen } from "@/learner/accueil/screens/PerformanceHistoryScreen";

/**
 * Performance History route — S3 · Task 3.10. `"use client"` because
 * `PerformanceHistoryScreen` reads `next-intl`/`next/navigation` hooks and
 * `react-i18next`, both of which need the client-side providers mounted by
 * the parent `(learner)/app/layout.tsx` — same rationale as every other
 * `(protected)` route (see `apprendre/page.tsx`).
 */
export default function HistoryPage() {
  return <PerformanceHistoryScreen />;
}
