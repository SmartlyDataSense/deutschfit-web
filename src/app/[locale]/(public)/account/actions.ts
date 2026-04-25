"use server";

import { redirect } from "next/navigation";
import { getServerClient } from "@/lib/supabase/server";
import { routing } from "@/i18n/routing";

/**
 * Sign-out server action. Calls Supabase's auth.signOut() to clear the
 * session cookie, then redirects to the locale-aware login page.
 */
export async function signOut(formData: FormData) {
  const rawLocale = formData.get("locale");
  const locale =
    typeof rawLocale === "string" && (routing.locales as readonly string[]).includes(rawLocale)
      ? rawLocale
      : routing.defaultLocale;
  const sb = await getServerClient();
  await sb.auth.signOut();
  redirect(`/${locale}/account/login`);
}
