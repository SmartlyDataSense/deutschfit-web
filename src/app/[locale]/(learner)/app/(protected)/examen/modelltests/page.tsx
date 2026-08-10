"use client";

import { ModelltestsListScreen } from "@/learner/exam/screens/ModelltestsListScreen";

/**
 * Modelltests picker route (S8 · Task 8.4). `"use client"` — same
 * rationale as every other `(protected)` route: client-only providers, no
 * server-side data fetching under this segment (see `apprendre/page.tsx`,
 * `examen/lesen/page.tsx`). Linked from `ExamHomeScreen`'s (Task 8.3)
 * "simulation" card at `/examen/modelltests` — this route must match.
 */
export default function ModelltestsPage() {
  return <ModelltestsListScreen />;
}
