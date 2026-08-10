"use client";

import { DeleteAccountScreen } from "@/learner/account-deletion/screens/DeleteAccountScreen";

/**
 * Account-deletion route — S11 · Task 8. Reached from both
 * `SettingsScreen`'s and `ProfilScreen`'s "Supprimer le compte" row
 * (`/app/profil/delete-account`). See `DeleteAccountScreen.tsx` for the
 * full safety contract (typed-token gate, edge fn → wipe → sign-out →
 * redirect).
 */
export default function DeleteAccountPage() {
  return <DeleteAccountScreen />;
}
