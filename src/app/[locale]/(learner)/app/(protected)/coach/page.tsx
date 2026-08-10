"use client";

import { BetreuerHubScreen } from "@/learner/coach/screens/BetreuerHubScreen";

/**
 * Coach (Betreuer tab) route — S9 Task 9.3. Replaces the placeholder
 * empty state with the real Betreuer hub (4 mode tiles). See
 * `apprendre/page.tsx` for the rationale on `"use client"` here.
 */
export default function CoachPage() {
  return <BetreuerHubScreen />;
}
