"use client";

import { DrillSessionScreen } from "@/learner/drill/screens/DrillSessionScreen";

/**
 * `/{locale}/app/drill/session` — the adaptive drill session (System A,
 * S9 · Task 9.6). Reached from the Accueil `PriorityTaskCard` CTA. No
 * route params — `useDrillSession` self-bootstraps the redo/home_daily
 * recommendation on mount.
 */
export default function DrillSessionPage() {
  return <DrillSessionScreen />;
}
