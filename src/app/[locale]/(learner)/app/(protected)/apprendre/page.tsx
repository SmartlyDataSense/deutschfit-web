"use client";

import { ApprendreScreen } from "@/learner/practice/screens/ApprendreScreen";

/**
 * Apprendre (Pratique tab) — Task 4.5 replaces the S1 nav-shell
 * placeholder with the real skill grid + retake-diagnostic block.
 * `"use client"` because `ApprendreScreen` reads `next-intl`/
 * `next/navigation` hooks and `react-i18next`, both of which need the
 * client-side providers mounted by the parent `(learner)/app/layout.tsx`
 * — matches the rest of `(protected)`, which is client-only per
 * `LearnerGuard`'s locked architecture (no server-side data fetching
 * under this segment).
 */
export default function ApprendrePage() {
  return <ApprendreScreen />;
}
