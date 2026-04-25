"use server";

import { redirect } from "next/navigation";
import { getServerClient } from "@/lib/supabase/server";

/**
 * Sign the operator out and bounce back to the admin login page. Lives in
 * its own file so the import boundary stays clean for the AdminNav client
 * surface (forms post to a server action via `action={signOutAction}`).
 */
export async function signOutAction() {
  const sb = await getServerClient();
  await sb.auth.signOut();
  redirect("/en/admin/login");
}
