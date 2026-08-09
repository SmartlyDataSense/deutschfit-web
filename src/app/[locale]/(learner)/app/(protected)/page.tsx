"use client";

import { AccueilScreen } from "@/learner/accueil/screens/AccueilScreen";

/**
 * Accueil (home) route — S3 · Task 3.9. Replaces the `<h1>Accueil</h1>`
 * placeholder with the real home screen. `"use client"` because
 * `AccueilScreen` reads `useLearnerSession` / `useExamContextStore` /
 * `react-i18next`, all of which need client-side context providers
 * mounted by the parent `(learner)/app/layout.tsx` — same rationale as
 * every other `(protected)` route (see `apprendre/page.tsx`).
 */
export default function AccueilPage() {
  return <AccueilScreen />;
}
