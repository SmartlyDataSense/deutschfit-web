"use client";

import { ObjectivesScreen } from "@/learner/settings/screens/ObjectivesScreen";

/**
 * Objectives route — S11 · Task 7. Reached from `SettingsScreen`'s
 * "Motivation et rythme" row (`/app/profil/settings/objectives`).
 * See `ObjectivesScreen.tsx` for composition (motivation + daily-minutes
 * pickers, upsert into `user_objectives`).
 */
export default function ObjectivesPage() {
  return <ObjectivesScreen />;
}
