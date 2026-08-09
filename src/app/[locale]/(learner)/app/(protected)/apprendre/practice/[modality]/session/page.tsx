"use client";

import { Suspense } from "react";
import { notFound, useParams, useSearchParams } from "next/navigation";

import { MODULE_BY_MODALITY } from "@/learner/practice/model/types";
import type { PracticeModality } from "@/learner/practice/model/types";
import { PracticeSessionScreen } from "@/learner/practice/screens/PracticeSessionScreen";

const PRACTICE_MODALITIES: readonly string[] = Object.keys(MODULE_BY_MODALITY);

function isPracticeModality(value: string): value is PracticeModality {
  return PRACTICE_MODALITIES.includes(value);
}

/**
 * Untimed practice session route — Task 4.7. `"use client"` (same
 * rationale as every other `(protected)` route: client-only providers, no
 * server-side data fetching under this segment — see `apprendre/page.tsx`).
 *
 * Reads `?slug=` via `useSearchParams`, which **must** be wrapped in
 * `<Suspense>` or `next build` fails (same pattern as
 * `app/onboarding/diagnostic/page.tsx`). An unrecognised `[modality]`
 * segment 404s via `notFound()` rather than falling through to the screen
 * with a modality it (and `MODULE_BY_MODALITY`) doesn't know.
 */
function PracticeSessionPageInner() {
  const params = useParams<{ modality: string }>();
  const searchParams = useSearchParams();
  const modality = params.modality;
  if (!isPracticeModality(modality)) {
    notFound();
  }
  const slug = searchParams.get("slug") ?? undefined;
  return <PracticeSessionScreen modality={modality} slug={slug} />;
}

export default function PracticeSessionPage() {
  return (
    <Suspense fallback={null}>
      <PracticeSessionPageInner />
    </Suspense>
  );
}
