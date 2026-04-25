import { NextResponse, type NextRequest } from "next/server";
import { getServerClient } from "@/lib/supabase/server";

/**
 * Magic-link callback for /admin. Supabase redirects here with a code
 * (PKCE) or token-hash query string; we exchange it for a session cookie
 * and bounce to /{locale}/admin. The dashboard layout enforces the
 * operator gate via requireOperator(), so non-operators end up on the
 * shared 404 page rather than a "forbidden" message.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");

  // Pull the locale prefix out of the pathname.
  const localeMatch = /^\/(en|fr)\//.exec(url.pathname);
  const locale = localeMatch?.[1] ?? "en";

  const sb = await getServerClient();

  if (code) {
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("admin callback exchange error", error);
      return NextResponse.redirect(new URL(`/${locale}/admin/login?error=exchange`, url));
    }
  } else if (tokenHash && type) {
    const { error } = await sb.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as "magiclink" | "email" | "recovery" | "invite" | "signup",
    });
    if (error) {
      console.error("admin callback verifyOtp error", error);
      return NextResponse.redirect(new URL(`/${locale}/admin/login?error=verify`, url));
    }
  } else {
    return NextResponse.redirect(new URL(`/${locale}/admin/login?error=missing_params`, url));
  }

  return NextResponse.redirect(new URL(`/${locale}/admin`, url));
}
