"use client";

import { useEffect, useRef } from "react";
import { useLocale } from "next-intl";

import { identifyUser, initPostHog, resetAnalyticsUser } from "./analytics/posthog";
import { bootstrapLearnerSession, useLearnerSession } from "./auth/useLearnerSession";
import { usePrefetchOnLogin } from "./content/usePrefetchOnLogin";
import { LearnerI18nProvider } from "./i18n/LearnerI18nProvider";
import { useOnboardingFlagStore } from "./onboarding/useOnboardingFlag";
import { clearReadiness } from "./readiness";
import { hydrateOnBoot, subscribeForegroundHydration } from "./readiness/hydrate";
import { installAcknowledgeAdapter } from "./submissions/installAcknowledgeAdapter";
import { installPollingAdapter } from "./submissions/installPollingAdapter";
import { useOnboardingAnswers } from "@/learner/onboarding/state/useOnboardingAnswers";
import { LearnerErrorBoundary } from "@/learner/ui/chrome/LearnerErrorBoundary";
import { OfflineBanner } from "@/learner/ui/chrome/OfflineBanner";

/**
 * Client-side provider root for the learner app, mounted by the
 * `(learner)/app` server layout.
 *
 * Responsibilities:
 *
 *   1. Mounts `LearnerI18nProvider`, seeded with the route's locale (from
 *      `next-intl`'s `useLocale()`, available here because the root
 *      `[locale]/layout.tsx` already wraps the tree in
 *      `NextIntlClientProvider`). This keeps the learner i18next instance
 *      in sync with the `/en/app` vs `/fr/app` URL instead of only
 *      resolving from `localStorage`.
 *   2. Kicks off `bootstrapLearnerSession()` once on mount. This runs
 *      above `LearnerGuard` (mounted lower, in the `(protected)` segment)
 *      so the session store starts resolving as early as possible —
 *      `dev/gallery` and `/app/login` render under this same provider
 *      without being gated, but still benefit from a warm session store
 *      if one becomes relevant to them later.
 *   3. Kicks off `initPostHog()` once on mount (Task 1.4) — no-ops when
 *      `NEXT_PUBLIC_POSTHOG_KEY` is unset. Once `useLearnerSession`'s
 *      status resolves, `identifyUser()` fires for an authenticated
 *      session and `resetAnalyticsUser()` fires otherwise (covers both
 *      "never signed in" and "just signed out" — both calls are cheap
 *      no-ops when there's nothing to reset).
 *   4. Mounts `OfflineBanner` as a sibling of `children` (not inside the
 *      error boundary below) so the offline indicator keeps working even
 *      if a render error trips the boundary, and above both `/app/login`
 *      and `(protected)` so it's visible regardless of auth state.
 *   5. Wraps `children` in `LearnerErrorBoundary` — inside
 *      `LearnerI18nProvider` (its fallback UI needs translated copy).
 *   6. On `"authenticated"` (S3 Task 3.3), installs the readiness
 *      side-effect adapters exactly once per `userId` —
 *      `installPollingAdapter()` (drives the poller for whatever
 *      submission is in-flight), `installAcknowledgeAdapter()` (server
 *      ack round-trip + localStorage retry queue), `hydrateOnBoot()`
 *      (replays the local Dexie slot / cross-device server rows), and
 *      `subscribeForegroundHydration()` (re-hydrates on tab-visible).
 *      The teardowns are kept in a ref and run — together with
 *      `clearReadiness()` — on `"unauthenticated"`, so a sign-out drops
 *      both the in-memory slot and every listener the adapters installed.
 *      The same branch also resets `useOnboardingAnswers` (S13 Task 7,
 *      M-2.11) — that store is session-local with no per-user
 *      namespacing, so without this a second user signing in on the same
 *      tab would inherit the first user's `motivation`/`schedule`
 *      answers into their own `finish()` call.
 *   7. Calls `usePrefetchOnLogin()` (S4 Task 4.10, port of mobile's
 *      `src/features/content/hooks/usePrefetchOnLogin.ts`) — warms the
 *      `prompts-list` content cache once per login transition so the S6
 *      Schreiben slice reads a warm cache instead of paying the first-load
 *      network round-trip. A plain hook call, not an adapter install — it
 *      owns its own effect/ref lifecycle and doesn't join the
 *      readiness-teardown ref machinery above.
 *
 * `bootstrapLearnerSession()` is idempotent (see its docstring), so
 * React StrictMode's double-invoke of effects in development is safe.
 * The readiness-adapter install below uses the same
 * once-per-`userId`-guard-via-ref idiom for the same reason: StrictMode
 * invokes the `[status, userId]` effect body twice in a row on mount
 * with no state change in between, and a plain `useRef` (unlike
 * `useState`) is shared across both invocations, so the second call
 * sees the guard already set and skips re-installing.
 */
export function LearnerProviders({ children }: { children: React.ReactNode }) {
  const locale = useLocale();
  const status = useLearnerSession((state) => state.status);
  const userId = useLearnerSession((state) => state.session?.user.id);
  const readinessInstalledForUserIdRef = useRef<string | null>(null);
  const readinessTeardownsRef = useRef<Array<() => void>>([]);

  // S4 Task 4.10 — port of mobile's usePrefetchOnLogin (src/features/content/
  // hooks/usePrefetchOnLogin.ts). Warms prompts-list once per login.
  usePrefetchOnLogin();

  useEffect(() => {
    void bootstrapLearnerSession();
  }, []);

  useEffect(() => {
    initPostHog();
  }, []);

  useEffect(() => {
    if (status === "authenticated" && userId) {
      if (readinessInstalledForUserIdRef.current !== userId) {
        readinessInstalledForUserIdRef.current = userId;
        const pollingTeardown = installPollingAdapter();
        const acknowledgeTeardown = installAcknowledgeAdapter();
        void hydrateOnBoot();
        const foregroundTeardown = subscribeForegroundHydration();
        readinessTeardownsRef.current = [pollingTeardown, acknowledgeTeardown, foregroundTeardown];
      }
      identifyUser(userId);
      useOnboardingFlagStore.getState().hydrateFor(userId);
    } else if (status === "unauthenticated") {
      if (readinessInstalledForUserIdRef.current !== null) {
        readinessInstalledForUserIdRef.current = null;
        for (const teardown of readinessTeardownsRef.current) {
          teardown();
        }
        readinessTeardownsRef.current = [];
        clearReadiness();
        useOnboardingAnswers.getState().reset();
      }
      resetAnalyticsUser();
      useOnboardingFlagStore.getState().hydrateFor(null);
    }
  }, [status, userId]);

  return (
    <LearnerI18nProvider lng={locale}>
      <OfflineBanner />
      <LearnerErrorBoundary>{children}</LearnerErrorBoundary>
    </LearnerI18nProvider>
  );
}
