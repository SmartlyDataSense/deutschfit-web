"use client";

import { SettingsScreen } from "@/learner/settings/screens/SettingsScreen";

/**
 * Settings route — S11 · Task 5. Reached from `ProfilScreen`'s header
 * settings button (`/app/profil/settings`). See `SettingsScreen.tsx`
 * for composition (language, exam track, objectives, analytics
 * placeholder, danger zone, about, dev-only gallery link).
 */
export default function SettingsPage() {
  return <SettingsScreen />;
}
