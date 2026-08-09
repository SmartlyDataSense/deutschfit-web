"use client";

import { HoerenIntroScreen } from "@/learner/hoeren/screens/HoerenIntroScreen";

/**
 * Graded Hören intro route (Task 5.9). `"use client"` — same rationale as
 * every other `(protected)` route: client-only providers, no server-side
 * data fetching under this segment (see `apprendre/page.tsx`,
 * `examen/lesen/page.tsx`).
 */
export default function HoerenIntroPage() {
  return <HoerenIntroScreen />;
}
