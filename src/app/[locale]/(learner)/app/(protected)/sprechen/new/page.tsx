"use client";

/**
 * Custom-topic authoring route (S7 Task 7.7). Plain client page — unlike
 * `sprechen/page.tsx` (`TopicPickerScreen`), `CustomTopicScreen` reads no
 * `useSearchParams()`, so no `<Suspense>` boundary is needed here (same
 * pattern as `schreiben/new/page.tsx`).
 */
import { CustomTopicScreen } from "@/learner/sprechen/screens/CustomTopicScreen";

export default function SprechenNewTopicPage() {
  return <CustomTopicScreen />;
}
