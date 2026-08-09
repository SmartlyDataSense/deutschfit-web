"use client";

/**
 * Sprechen topic-picker route (S7 Task 7.6). `TopicPickerScreen` reads
 * `react-i18next` / exam-context / analytics context mounted by the
 * parent `(learner)/app/layout.tsx`, same `"use client"` rationale as
 * every other `(protected)` route (see `apprendre/practice/page.tsx`).
 * No `useSearchParams()` here (unlike `schreiben/page.tsx`), so no
 * `<Suspense>` boundary is required.
 */
import { TopicPickerScreen } from "@/learner/sprechen/screens/TopicPickerScreen";

export default function SprechenPage() {
  return <TopicPickerScreen />;
}
