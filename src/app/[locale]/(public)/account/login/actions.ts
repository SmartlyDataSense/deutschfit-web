"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { getServerClient } from "@/lib/supabase/server";

const schema = z.object({
  email: z.string().email(),
  locale: z.enum(["en", "fr"]),
});

export type LoginActionState =
  | { status: "idle" }
  | { status: "ok" }
  | { status: "error"; message: string };

/**
 * Server action wired to the magic-link form. We never echo the validation
 * detail back to the user (anti-enumeration) — any failure renders the
 * same generic error.
 */
export async function requestMagicLink(
  _prev: LoginActionState,
  formData: FormData
): Promise<LoginActionState> {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    locale: formData.get("locale"),
  });
  if (!parsed.success) {
    return { status: "error", message: "invalid-input" };
  }

  const { email, locale } = parsed.data;

  const origin = await resolveOrigin();
  const emailRedirectTo = `${origin}/${locale}/account/auth/callback`;

  const sb = await getServerClient();
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo },
  });

  if (error) {
    // Don't leak provider state. The page surfaces a generic error.
    return { status: "error", message: "send-failed" };
  }
  return { status: "ok" };
}

async function resolveOrigin(): Promise<string> {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return stripTrailingSlash(fromEnv);
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  if (host) return `${proto}://${host}`;
  return "http://localhost:3000";
}

function stripTrailingSlash(s: string): string {
  return s.endsWith("/") ? s.slice(0, -1) : s;
}
