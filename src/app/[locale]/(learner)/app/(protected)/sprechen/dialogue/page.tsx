"use client";

/**
 * Dialogue Teil-picker route (S7 Task 7.11). `DialogueTeilPickerScreen`
 * self-hydrates exam context and reads `react-i18next` mounted by the
 * parent `(learner)/app/layout.tsx`, same `"use client"` rationale as every
 * other `(protected)` route. No `useSearchParams()` here, so no
 * `<Suspense>` boundary is required.
 */
import { DialogueTeilPickerScreen } from "@/learner/sprechen/dialogue/screens/DialogueTeilPickerScreen";

export default function DialoguePickerPage() {
  return <DialogueTeilPickerScreen />;
}
