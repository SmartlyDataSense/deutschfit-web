"use client";

import { PracticeHubScreen } from "@/learner/practice/screens/PracticeHubScreen";

/**
 * Übungen hub route — Task 4.5. `"use client"` because
 * `PracticeHubScreen` reads `react-i18next` (`LearnerI18nProvider`
 * context) and the exam-context/practice-hub hooks, mounted by the
 * parent `(learner)/app/layout.tsx` — same rationale as every other
 * `(protected)` route (see `apprendre/page.tsx`).
 */
export default function ApprendrePracticePage() {
  return <PracticeHubScreen />;
}
