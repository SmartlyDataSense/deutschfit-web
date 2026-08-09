"use client";

/**
 * Custom-prompt authoring route (S6 Task 6.7). Plain client page — unlike
 * `schreiben/page.tsx` (`PromptListScreen`), `CustomPromptScreen` reads no
 * `useSearchParams()`, so no `<Suspense>` boundary is needed here (same
 * pattern as `exam-date/page.tsx`).
 */
import { CustomPromptScreen } from "@/learner/schreiben/screens/CustomPromptScreen";

export default function SchreibenNewPromptPage() {
  return <CustomPromptScreen />;
}
