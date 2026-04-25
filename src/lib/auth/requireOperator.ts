import "server-only";

import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/database.types";

export type RequireOperatorResult = {
  userId: string;
  email: string | null;
};

/**
 * Server-side gate for any /admin route. Returns `{ userId, email }` when
 * the caller is signed in AND `user_profiles.is_operator = true`.
 *
 * On miss this throws `notFound()` rather than redirecting — leaking the
 * existence of an admin URL to a non-operator is itself a discoverability
 * leak. The global 404 page hides everything.
 *
 * Pass an SSR client (`getServerClient()`); the function reads the session
 * via `auth.getUser()` and queries `user_profiles` for the `is_operator`
 * flag. Tests inject a stub client that mirrors the same shape.
 */
export async function requireOperator(
  sb: SupabaseClient<Database>
): Promise<RequireOperatorResult> {
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) notFound();

  const { data, error } = await sb
    .from("user_profiles")
    .select("is_operator")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data?.is_operator) notFound();

  return { userId: user.id, email: user.email ?? null };
}
