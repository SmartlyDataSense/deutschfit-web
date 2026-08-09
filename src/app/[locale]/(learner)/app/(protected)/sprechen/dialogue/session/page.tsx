"use client";

/**
 * Dialogue session route (S7 Task 7.11). Reads `teil` / `themeId` from the
 * query string — set by `DialogueTeilPickerScreen`'s card-select handler
 * (`?teil=<teil>&themeId=<themes[0].slug>`). `useSearchParams` requires a
 * `<Suspense>` boundary at build time (Next.js App Router), same split as
 * `hoeren/session/page.tsx`.
 */
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import { DialogueSessionScreen } from "@/learner/sprechen/dialogue/screens/DialogueSessionScreen";

function DialogueSessionPageInner() {
  const params = useSearchParams();
  const teil = params.get("teil") ?? "";
  const themeId = params.get("themeId") ?? undefined;

  return <DialogueSessionScreen teil={teil} themeId={themeId} />;
}

export default function DialogueSessionPage() {
  return (
    <Suspense fallback={null}>
      <DialogueSessionPageInner />
    </Suspense>
  );
}
