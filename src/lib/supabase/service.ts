import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/database.types";

// Defence-in-depth runtime guard. `server-only` blocks the import at build
// time, but a stray dynamic import or edge-case loader could still reach
// here — bail loudly if `window` is present. The service-role key bypasses
// every RLS policy, so a leaked client would be catastrophic.
if (typeof window !== "undefined") {
  throw new Error("service-role client cannot run in browser");
}

/**
 * Service-role Supabase client. Bypasses RLS — restricted to server-side
 * code paths (Server Actions, Route Handlers, edge runtime). W3 wires it
 * for completeness; the actual operator flows that need it land in W4.
 *
 * Never import this from a client component or expose its return value
 * to the browser.
 */
export function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Supabase env vars missing: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required."
    );
  }
  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
