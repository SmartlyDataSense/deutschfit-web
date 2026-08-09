"use client";

import { Suspense } from "react";
import { notFound, redirect, useParams, useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";

import type { TextPracticeModality } from "@/learner/practice/model/types";
import { PracticeSessionScreen } from "@/learner/practice/screens/PracticeSessionScreen";

// This route only serves the lock/persistence-backed session
// (`TextPracticeModality` — Lesen, Sprachbausteine); `"hoeren"` is a
// known `PracticeModality` but is handled separately below (redirect,
// not 404) since it's a compile-time-excluded param here (Task 5.5).
const TEXT_PRACTICE_MODALITIES: readonly string[] = ["lesen", "sprachbausteine"];

function isTextPracticeModality(value: string): value is TextPracticeModality {
  return TEXT_PRACTICE_MODALITIES.includes(value);
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
 * with a modality it doesn't know.
 *
 * `"hoeren"` deep-link safety (Task 5.5): `PracticeSessionScreen` only
 * accepts `TextPracticeModality` (P13: Hören persists nothing, so it
 * cannot share the lock-based session screen) — but a stale/typed-in
 * `.../practice/hoeren/session?slug=` link is a real reachable URL (this
 * route tree served `hoeren` before Task 5.5's picker started mapping it
 * to `/hoeren/session` instead). Rather than 404 a link that clearly
 * expresses working intent, redirect it to the real Hören session route,
 * preserving `?slug=`.
 */
function PracticeSessionPageInner() {
  const params = useParams<{ modality: string }>();
  const searchParams = useSearchParams();
  const locale = useLocale();
  const modality = params.modality;
  const slug = searchParams.get("slug") ?? undefined;

  if (modality === "hoeren") {
    redirect(slug ? `/${locale}/app/hoeren/session?slug=${slug}` : `/${locale}/app/hoeren/session`);
  }

  if (!isTextPracticeModality(modality)) {
    notFound();
  }

  return <PracticeSessionScreen modality={modality} slug={slug} />;
}

export default function PracticeSessionPage() {
  return (
    <Suspense fallback={null}>
      <PracticeSessionPageInner />
    </Suspense>
  );
}
