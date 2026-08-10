"use client";

import { ExamHomeScreen } from "@/learner/exam/screens/ExamHomeScreen";

/**
 * Examen tab root route (S8 · Task 8.3). Placeholder replaced —
 * `"use client"` for the same reason as every other `(protected)` route
 * (see `apprendre/page.tsx`): client-only providers, no server-side data
 * fetching under this segment.
 */
export default function ExamenPage() {
  return <ExamHomeScreen />;
}
