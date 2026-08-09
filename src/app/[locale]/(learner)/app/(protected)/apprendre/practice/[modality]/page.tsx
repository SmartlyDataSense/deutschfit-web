"use client";

import { notFound, useParams } from "next/navigation";

import { MODULE_BY_MODALITY } from "@/learner/practice/model/types";
import type { PracticeModality } from "@/learner/practice/model/types";
import { PracticeSetPickerScreen } from "@/learner/practice/screens/PracticeSetPickerScreen";

const PRACTICE_MODALITIES: readonly string[] = Object.keys(MODULE_BY_MODALITY);

function isPracticeModality(value: string): value is PracticeModality {
  return PRACTICE_MODALITIES.includes(value);
}

/**
 * Übungstest picker route — Task 4.6. `"use client"` (same rationale as
 * every other `(protected)` route: client-only providers, no server-side
 * data fetching under this segment — see `apprendre/page.tsx`).
 *
 * `useParams()` reads the dynamic `[modality]` segment; an unrecognised
 * value 404s via `notFound()` rather than falling through to the screen
 * with a modality it (and `MODULE_BY_MODALITY`) doesn't know.
 *
 * `isPracticeModality` derives its allow-list from `MODULE_BY_MODALITY`'s
 * keys, so `"hoeren"` (Task 5.5) is a valid param here with no edit to
 * this guard — `PracticeSetPickerScreen` (unlike the text-only session
 * screen) is not narrowed to `TextPracticeModality`, since it also owns
 * the hoeren → `/hoeren/session` route mapping.
 */
export default function PracticeSetPickerPage() {
  const params = useParams<{ modality: string }>();
  const modality = params.modality;
  if (!isPracticeModality(modality)) {
    notFound();
  }
  return <PracticeSetPickerScreen modality={modality} />;
}
