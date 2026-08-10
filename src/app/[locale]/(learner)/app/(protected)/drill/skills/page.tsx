"use client";

import { DrillSkillProfileScreen } from "@/learner/drill/screens/DrillSkillProfileScreen";

/**
 * `/{locale}/app/drill/skills` — the "Mes points" skill-profile surface
 * (S9 · Task 9.7). Reached from the Betreuer hub `exercices` tile
 * (`coach:hub.tiles.exercices` → `betreuer-hub-tile-exercices`, wired in
 * Task 9.3). No route params — the screen self-bootstraps the
 * `user_concept_mastery` read on mount.
 */
export default function DrillSkillProfilePage() {
  return <DrillSkillProfileScreen />;
}
