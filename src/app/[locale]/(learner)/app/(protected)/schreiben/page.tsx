"use client";

/**
 * Schreiben prompt-list route (S6 Task 6.6). `PromptListScreen` calls
 * `useSearchParams()` internally (one-shot `?created=` / `?board=` /
 * `?submitted=` params — see that screen's doc comment), so this page
 * wraps it in a `<Suspense>` boundary at build time (Next.js App Router
 * requirement — P7, same split as `hoeren/session/page.tsx`).
 */
import { Suspense } from "react";

import { PromptListScreen } from "@/learner/schreiben/screens/PromptListScreen";

export default function SchreibenPage() {
  return (
    <Suspense fallback={null}>
      <PromptListScreen />
    </Suspense>
  );
}
