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

/**
 * Delete-account server action. Apple App Store Review Guideline 5.1.1(v)
 * requires apps that support account creation to expose an in-product
 * deletion path; the corresponding Apple App Privacy "data deletion URL"
 * surfaces here at deutschfit.app/account so reviewers (and any user who
 * cannot reach the mobile binary) have a web-accessible fallback.
 *
 * The action POSTs to the same `account-delete` Supabase edge function the
 * mobile app calls. The function (deployed by deutschfit-backend) writes an
 * immutable audit row, scrubs storage objects, then calls
 * `auth.admin.deleteUser`, which cascades the public-schema rows.
 *
 * The contract is "synchronous, irreversible". On success we sign the user
 * out (clears the session cookie via the response headers) and redirect to
 * the locale-aware home with `?deleted=1`; the home page can show a toast
 * the next time it has UI for it. On failure the user stays signed in and
 * is bounced back to /account with `?delete=failed` so the page can render
 * an inline error.
 */
export async function deleteAccount(formData: FormData) {
  const rawLocale = formData.get("locale");
  const locale =
    typeof rawLocale === "string" && (routing.locales as readonly string[]).includes(rawLocale)
      ? rawLocale
      : routing.defaultLocale;

  const confirm = formData.get("confirm");
  if (typeof confirm !== "string" || confirm.trim().toUpperCase() !== "DELETE") {
    redirect(`/${locale}/account?delete=invalid_confirm#delete`);
  }

  const sb = await getServerClient();
  const {
    data: { user },
    error: sessErr,
  } = await sb.auth.getUser();
  if (sessErr || !user) {
    redirect(`/${locale}/account/login`);
  }

  const fnRes = await sb.functions.invoke("account-delete", {
    method: "POST",
    body: { source: "web" },
  });
  if (fnRes.error) {
    // Surface a human-readable failure to the page; the user is still
    // signed in (the edge function only deletes after the audit row +
    // storage scrub succeed, so if it errored, no irreversible work was
    // done from the client's point of view).
    redirect(`/${locale}/account?delete=failed#delete`);
  }

  await sb.auth.signOut();
  redirect(`/${locale}/?deleted=1`);
}
