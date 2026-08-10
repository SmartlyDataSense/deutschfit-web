"use client";

import { ExamSelectorScreen } from "@/learner/settings/screens/ExamSelectorScreen";

/**
 * Exam selector route — S11 · Task 6. Reached from `SettingsScreen`'s
 * "Changer d'examen ou de niveau" row (`/app/profil/settings/exam-selector`).
 * Unrestricted twin of `ExamTrackScreen` — see `ExamSelectorScreen.tsx`.
 */
export default function ExamSelectorPage() {
  return <ExamSelectorScreen />;
}
