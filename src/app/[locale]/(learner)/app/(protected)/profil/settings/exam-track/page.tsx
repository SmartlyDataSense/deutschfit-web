"use client";

import { ExamTrackScreen } from "@/learner/settings/screens/ExamTrackScreen";

/**
 * Exam track route — S11 · Task 6. Reached from `SettingsScreen`'s
 * "Parcours d'examen" row (`/app/profil/settings/exam-track`). See
 * `ExamTrackScreen.tsx` for composition (beta-gated level picker,
 * all-boards board picker, diagnostic retake row).
 */
export default function ExamTrackPage() {
  return <ExamTrackScreen />;
}
