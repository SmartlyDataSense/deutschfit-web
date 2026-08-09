/**
 * `usePrefetchOnLogin` — warms the content cache on every login transition.
 *
 * Port of `deutschfit-mobile/src/features/content/hooks/usePrefetchOnLogin.ts`
 * (S4 Task 4.10), `useAuth` → `useLearnerSession`. Subscribes to the
 * `useLearnerSession` zustand store and, on each non-null → non-null
 * transition where the user id changes (or null → non-null), fires
 * `prefetchOnLogin()` once. Running it on every state change would spam the
 * edge function; running it only on the very first login would miss account
 * switches during a single tab session.
 *
 * Wired from `LearnerProviders` (top level, alongside the existing hooks —
 * it is a hook, not an adapter install, so it does not join the
 * readiness-teardown ref machinery there).
 */
import { useEffect, useRef } from "react";

import { prefetchOnLogin } from "./prefetchOnLogin";
import { useLearnerSession } from "@/learner/core/auth/useLearnerSession";

export function usePrefetchOnLogin(): void {
  const lastUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const unsubscribe = useLearnerSession.subscribe((state) => {
      const nextUserId = state.session?.user.id ?? null;
      if (nextUserId && nextUserId !== lastUserIdRef.current) {
        lastUserIdRef.current = nextUserId;
        // Fire-and-forget — prefetchOnLogin swallows its own errors.
        void prefetchOnLogin();
      } else if (!nextUserId) {
        lastUserIdRef.current = null;
      }
    });
    // Fire once at mount for sessions already restored before we subscribed.
    const current = useLearnerSession.getState().session?.user.id ?? null;
    if (current) {
      lastUserIdRef.current = current;
      void prefetchOnLogin();
    }
    return () => {
      unsubscribe();
    };
  }, []);
}
