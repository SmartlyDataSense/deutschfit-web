import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/shared/database.types";

/**
 * Anon-key Supabase client for Server Components, Route Handlers, and
 * Server Actions. Bridges Next.js's async cookie store so `@supabase/ssr`
 * can read/refresh the auth session cookie set by the magic-link flow.
 *
 * RLS still applies — this client respects `auth.uid()` and policies, so
 * it's the right choice for any "act as the signed-in user" read or write.
 */
export async function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Supabase env vars missing: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required."
    );
  }
  const store = await cookies();
  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        // In Server Components Next.js disallows mutating cookies; the
        // try/catch lets us call this from both Server Actions/Route
        // Handlers (where set is allowed) and RSCs (where it isn't).
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // no-op: read-only context.
        }
      },
    },
  });
}
