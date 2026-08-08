/**
 * Learner session store (zustand) + bootstrap lifecycle.
 *
 * Ports `deutschfit-mobile`'s `src/core/auth/useAuth.ts` +
 * `src/core/auth/session.ts` to the web learner app. Two files there become
 * one here (no `AppState`/push-token/analytics wiring to carry over yet —
 * those land in later slices), but the auth semantics are unchanged:
 *
 *   1. `status: "loading" | "authenticated" | "unauthenticated"` drives
 *      `LearnerGuard` (splash while loading, redirect when unauthenticated).
 *   2. Warm-start freshness gate: `getSession()` returns whatever the
 *      browser client has cached locally without contacting the network.
 *      On a warm start past (or near) the access-token TTL, that token is
 *      stale — publishing it would let guarded screens mount and every
 *      JWT-protected edge call 401 before any lazy refresh ticks. So: if
 *      the cached session is within `SESSION_FRESHNESS_THRESHOLD_SEC` of
 *      expiry (or already past), a synchronous `refreshSession()` runs
 *      first. If that fails, `null` is published so the guard redirects to
 *      sign-in cleanly instead of the app showing a broken authenticated
 *      shell.
 *   3. `PASSWORD_RECOVERY` events are suppressed from the store on purpose
 *      — same rationale as mobile: Supabase emits this after
 *      `exchangeCodeForSession` succeeds during the reset flow, and
 *      propagating it would let `LearnerGuard` treat the user as signed in
 *      and skip the reset-password screen.
 *   4. `bootstrapLearnerSession()` is idempotent: the `onAuthStateChange`
 *      subscription is cached at module scope and torn down before
 *      re-subscribing, so repeated *sequential* calls (e.g. Fast Refresh,
 *      or a genuine remount after unmount) never leak listeners.
 *   5. `bootstrapLearnerSession()` is also safe under *concurrent*
 *      invocation via a module-level in-flight promise guard. React
 *      StrictMode's dev double-invoke fires the mount effect (and thus
 *      `void bootstrapLearnerSession()`) twice back-to-back with no await
 *      in between — without the guard, both calls would read
 *      `currentSubscription !== null` as `false` before either had a
 *      chance to set it, so neither would unsubscribe, both would call
 *      `onAuthStateChange`, and the second write would silently clobber
 *      the first subscription reference (a real listener leak, and every
 *      future auth event double-firing `setSession`). Concurrent callers
 *      now share the same in-flight `Promise` instead of each starting
 *      their own run.
 */
import type { Session } from "@supabase/supabase-js";
import { create } from "zustand";

import { getBrowserClient } from "@/lib/supabase/browser";

export type LearnerSessionStatus = "loading" | "authenticated" | "unauthenticated";

export interface LearnerSessionState {
  session: Session | null;
  status: LearnerSessionStatus;
  setSession: (session: Session | null) => void;
  setStatus: (status: LearnerSessionStatus) => void;
  /**
   * Signs out of this device only (`{ scope: "local" }`) — mirrors the
   * API client's session_expired path (see `core/api/client.ts`) and
   * mobile's rationale (issue #332): never revoke the user's other
   * sessions (e.g. the mobile app) just because the web tab signed out.
   */
  signOut: () => Promise<void>;
}

export const useLearnerSession = create<LearnerSessionState>((set) => ({
  session: null,
  status: "loading",
  setSession: (session) =>
    set({
      session,
      status: session ? "authenticated" : "unauthenticated",
    }),
  setStatus: (status) => set({ status }),
  signOut: async () => {
    const supabase = getBrowserClient();
    await supabase.auth.signOut({ scope: "local" });
    set({ session: null, status: "unauthenticated" });
  },
}));

/**
 * Threshold (seconds) within which a cached session is considered stale
 * enough to warrant a synchronous refresh before publishing it to
 * `useLearnerSession`. Matches mobile's `SESSION_FRESHNESS_THRESHOLD_SEC`.
 */
const SESSION_FRESHNESS_THRESHOLD_SEC = 60;

type AuthSubscription = ReturnType<
  ReturnType<typeof getBrowserClient>["auth"]["onAuthStateChange"]
>["data"]["subscription"];

let currentSubscription: AuthSubscription | null = null;

/**
 * In-flight guard (module docstring point 5). `null` when no bootstrap
 * run is currently executing; otherwise the `Promise` every concurrent
 * caller awaits instead of starting a second, racing run. Cleared once
 * the run settles so a later, genuinely separate call still does a full
 * teardown-and-resubscribe (module docstring point 4).
 */
let inFlightBootstrap: Promise<void> | null = null;

/**
 * Called once on mount (from `LearnerProviders`). Hydrates the store from
 * whatever the browser client has cached, then subscribes to
 * `onAuthStateChange` so in-tab sign-ins / sign-outs keep the store in
 * sync. Safe to call more than once, whether sequentially or concurrently
 * — see module docstring points 4 and 5.
 */
export function bootstrapLearnerSession(): Promise<void> {
  if (inFlightBootstrap !== null) {
    return inFlightBootstrap;
  }
  inFlightBootstrap = runBootstrap().finally(() => {
    inFlightBootstrap = null;
  });
  return inFlightBootstrap;
}

async function runBootstrap(): Promise<void> {
  useLearnerSession.getState().setStatus("loading");
  const supabase = getBrowserClient();

  const { data } = await supabase.auth.getSession();
  const cached = data.session ?? null;

  let session = cached;
  if (cached !== null) {
    const nowSec = Math.floor(Date.now() / 1000);
    const expiresAt = cached.expires_at ?? 0;
    const secsUntilExpiry = expiresAt - nowSec;
    if (secsUntilExpiry < SESSION_FRESHNESS_THRESHOLD_SEC) {
      try {
        const { data: refreshed } = await supabase.auth.refreshSession();
        session = refreshed.session ?? null;
      } catch {
        session = null;
      }
    }
  }
  useLearnerSession.getState().setSession(session);

  // Tear down any previous subscription (repeated calls, Fast Refresh)
  // before re-subscribing. Without this we leak one listener per call.
  if (currentSubscription !== null) {
    currentSubscription.unsubscribe();
    currentSubscription = null;
  }

  const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
    // Suppress PASSWORD_RECOVERY — see module docstring point 3.
    if (event === "PASSWORD_RECOVERY") return;
    useLearnerSession.getState().setSession(nextSession ?? null);
  });
  currentSubscription = listener.subscription;
}
