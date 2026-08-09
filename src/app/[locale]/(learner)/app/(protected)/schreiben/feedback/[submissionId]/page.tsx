"use client";

/**
 * Schreiben feedback route (S6 Task 6.9). `useParams()` reads the dynamic
 * `[submissionId]` segment and passes it down as a prop — same split as
 * `schreiben/compose/[promptId]/page.tsx` → `SchreibenEditorScreen` (Task
 * 6.8), which itself mirrors the one other dynamic-route precedent in this
 * app (`apprendre/practice/[modality]/page.tsx`). Keeps `FeedbackScreen`
 * testable without mocking `next/navigation`'s `useParams`.
 */
import { useParams } from "next/navigation";

import { FeedbackScreen } from "@/learner/schreiben/screens/FeedbackScreen";

export default function SchreibenFeedbackPage() {
  const params = useParams<{ submissionId: string }>();
  return <FeedbackScreen submissionId={params.submissionId} />;
}
