"use client";

/**
 * Dialogue feedback route (S7 Task 7.11). `DialogueFeedbackScreen` reads
 * the non-persisted `useDialogueResult` store directly — no route params,
 * so no `useSearchParams()` and no `<Suspense>` boundary is required.
 */
import { DialogueFeedbackScreen } from "@/learner/sprechen/dialogue/screens/DialogueFeedbackScreen";

export default function DialogueFeedbackPage() {
  return <DialogueFeedbackScreen />;
}
