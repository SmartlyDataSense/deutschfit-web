"use client";

/**
 * Schreiben composer route (S6 Task 6.8). `useParams()` reads the dynamic
 * `[promptId]` segment and passes it down as a prop — same split as
 * `apprendre/practice/[modality]/page.tsx` → `PracticeSetPickerScreen`
 * (the one other dynamic-route precedent in this app). Keeps
 * `SchreibenEditorScreen` testable without mocking `next/navigation`'s
 * `useParams`.
 *
 * No `<Suspense>` boundary needed — `SchreibenEditorScreen` reads no
 * `useSearchParams()` (unlike `schreiben/page.tsx`'s `PromptListScreen`).
 */
import { useParams } from "next/navigation";

import { SchreibenEditorScreen } from "@/learner/schreiben/screens/SchreibenEditorScreen";

export default function SchreibenComposePage() {
  const params = useParams<{ promptId: string }>();
  return <SchreibenEditorScreen promptId={params.promptId} />;
}
