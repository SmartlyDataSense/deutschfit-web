import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { routing } from "@/i18n/routing";

/**
 * Magic-link callback. Exchanges the `code` query param for a Supabase
 * session cookie via `@supabase/ssr`'s server client, then redirects to
 * the locale-aware account page.
 */
export async function GET(req: Request, context: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await context.params;
  const locale = (routing.locales as readonly string[]).includes(rawLocale)
    ? rawLocale
    : routing.defaultLocale;

  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  if (code) {
    const sb = await getServerClient();
    await sb.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(new URL(`/${locale}/account`, url.origin));
}
