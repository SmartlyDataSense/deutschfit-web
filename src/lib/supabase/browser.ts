"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/shared/database.types";

/**
 * Anon-key Supabase client for browser-side use (e.g. magic-link signup
 * forms in client components). Reads `NEXT_PUBLIC_SUPABASE_URL` and
 * `NEXT_PUBLIC_SUPABASE_ANON_KEY` so it's safe to ship to the browser.
 */
export function getBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Supabase env vars missing: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required."
    );
  }
  return createBrowserClient<Database>(url, anonKey);
}
