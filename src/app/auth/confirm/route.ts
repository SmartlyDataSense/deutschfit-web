import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Email-confirmation bridge for DeutschFit.
 *
 * Supabase emails (sign-up, recovery, invite, magic-link, email-change) point
 * here with `?token_hash=…&type=…`. Behaviour splits by type and UA:
 *
 *   recovery + mobile UA
 *     → deutschfit://reset?token_hash=… (no server-side verify)
 *     The app calls verifyOtp() with the anon key, which fires
 *     PASSWORD_RECOVERY and routes to the ResetPassword screen via the
 *     linking config. We must NOT consume the token here — setSession()
 *     from a server-side session fires SIGNED_IN (not PASSWORD_RECOVERY),
 *     which breaks screen routing.
 *
 *   all other types + mobile UA
 *     → verify server-side, extract session tokens, redirect to
 *       deutschfit://auth/callback?access_token=…&refresh_token=…
 *     deepLinkHandler Path B calls setSession() → SIGNED_IN → auto sign-in.
 *
 *   desktop UA → verify server-side → /auth/confirmed
 *
 * Failures land on /auth/error?reason=… so the user always sees a page.
 *
 * NEVER expose SUPABASE_SERVICE_ROLE_KEY to the client. The nodejs runtime +
 * server-only handler keeps it on the server.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const APP_SCHEME = "deutschfit://auth/callback";
const WEB_FALLBACK = "/auth/confirmed";

// Mirrors `EmailOtpType` from `@supabase/supabase-js`. We narrow the value
// at the parse boundary so downstream `verifyOtp` is fully typed.
const VALID_TYPES = ["email", "recovery", "invite", "email_change", "magiclink", "signup"] as const;
type ConfirmType = (typeof VALID_TYPES)[number];

function isConfirmType(v: string | null): v is ConfirmType {
  return v !== null && (VALID_TYPES as readonly string[]).includes(v);
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token_hash = url.searchParams.get("token_hash");
  const typeRaw = url.searchParams.get("type");

  if (!token_hash || !isConfirmType(typeRaw)) {
    return NextResponse.redirect(new URL("/auth/error?reason=missing_params", req.url));
  }
  const type: ConfirmType = typeRaw;

  const ua = req.headers.get("user-agent") ?? "";
  const isMobile = /iPhone|iPad|Android/i.test(ua);

  // Recovery on mobile: pass token_hash to the app without consuming it here.
  if (isMobile && type === "recovery") {
    return NextResponse.redirect(
      `deutschfit://reset?token_hash=${encodeURIComponent(token_hash)}`,
      { status: 302 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.redirect(new URL("/auth/error?reason=server_misconfigured", req.url));
  }

  const sb = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await sb.auth.verifyOtp({ token_hash, type });
  if (error) {
    return NextResponse.redirect(
      new URL(`/auth/error?reason=${encodeURIComponent(error.message)}`, req.url)
    );
  }

  if (isMobile) {
    if (data.session) {
      const { access_token, refresh_token } = data.session;
      return NextResponse.redirect(
        `${APP_SCHEME}?type=${type}&access_token=${encodeURIComponent(access_token)}&refresh_token=${encodeURIComponent(refresh_token)}`,
        { status: 302 }
      );
    }
    return NextResponse.redirect(`${APP_SCHEME}?type=${type}&status=ok`, { status: 302 });
  }
  return NextResponse.redirect(new URL(`${WEB_FALLBACK}?type=${type}`, req.url));
}
