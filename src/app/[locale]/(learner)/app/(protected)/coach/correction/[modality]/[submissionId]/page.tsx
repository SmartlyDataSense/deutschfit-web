"use client";

import { notFound, useParams } from "next/navigation";

import {
  CorrectionWalkthroughScreen,
  isModality,
} from "@/learner/coach/correction/screens/CorrectionWalkthroughScreen";

/**
 * Correction walkthrough route — Task 9.9. `"use client"` (same rationale
 * as every other `(protected)` route). `useParams()` reads the dynamic
 * `[modality]`/`[submissionId]` segments; an unrecognised `modality` 404s
 * via `notFound()` rather than reaching `CorrectionWalkthroughScreen` with
 * a value it doesn't know — mirrors
 * `apprendre/practice/[modality]/page.tsx`'s exact guard pattern.
 */
export default function CorrectionWalkthroughPage() {
  const params = useParams<{ modality: string; submissionId: string }>();
  const { modality, submissionId } = params;
  if (!isModality(modality)) {
    notFound();
  }
  return <CorrectionWalkthroughScreen submissionId={submissionId} modality={modality} />;
}
