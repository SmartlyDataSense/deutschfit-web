"use server";

import { headers } from "next/headers";
import { getServerClient } from "@/lib/supabase/server";

export type AdminLoginResult = { ok: true } | { ok: false; error: string };

/**
 * Server action: send a magic link to the operator's email.
 *
 * The redirect URL points to /{locale}/admin/auth/callback. The exchange
 * step there confirms the session, then `requireOperator()` on the layout
 * decides whether to render the dashboard or 404. We DO NOT check
 * `is_operator` here — leaking "this email is an operator" via a different
 * error message is the same discoverability leak as a redirect.
 */
export async function requestAdminMagicLink(
  _prev: AdminLoginResult | undefined,
  formData: FormData
): Promise<AdminLoginResult> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const locale = String(formData.get("locale") ?? "en");

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "invalid_email" };
  }

  const sb = await getServerClient();

  const headerList = await headers();
  const proto = headerList.get("x-forwarded-proto") ?? "https";
  const host = headerList.get("host") ?? "";
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ||
    (host ? `${proto}://${host}` : "http://localhost:3000");

  const localeSegment = locale === "fr" ? "fr" : "en";
  const redirectTo = `${origin}/${localeSegment}/admin/auth/callback`;

  const { error } = await sb.auth.signInWithOtp({
    email,
    options: {
      // Existing-only — admin sign-in must never silently provision a new
      // auth user from the back-office surface. The operator row is seeded
      // by 0048; non-operators get a no-op response.
      shouldCreateUser: false,
      emailRedirectTo: redirectTo,
    },
  });

  if (error) {
    // Resend rate-limit, smtp failure, etc. — surface a generic message,
    // log details server-side via console for now.
    console.error("admin magic-link error", error);
    return { ok: false, error: "send_failed" };
  }

  return { ok: true };
}
