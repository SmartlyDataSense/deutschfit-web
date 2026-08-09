"use client";

import { LesenIntroScreen } from "@/learner/lesen/screens/LesenIntroScreen";

/**
 * Graded Lesen intro route (Task 4.8). `"use client"` — same rationale as
 * every other `(protected)` route: client-only providers, no server-side
 * data fetching under this segment (see `apprendre/page.tsx`).
 */
export default function LesenIntroPage() {
  return <LesenIntroScreen />;
}
