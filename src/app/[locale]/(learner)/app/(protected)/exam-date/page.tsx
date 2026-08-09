"use client";

import { ChangeExamDateScreen } from "@/learner/accueil/screens/ChangeExamDateScreen";

/**
 * Change-Exam-Date route — S3 · Task 3.11. `"use client"` because
 * `ChangeExamDateScreen` reads `next-intl`/`next/navigation` hooks and
 * `react-i18next`, both of which need the client-side providers mounted by
 * the parent `(learner)/app/layout.tsx` — same rationale as every other
 * `(protected)` route (see `history/page.tsx`).
 */
export default function ExamDatePage() {
  return <ChangeExamDateScreen />;
}
