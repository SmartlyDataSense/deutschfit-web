"use client";

import { useEffect } from "react";
import { useLocale } from "next-intl";

import { identifyUser, initPostHog, resetAnalyticsUser } from "./analytics/posthog";
import { bootstrapLearnerSession, useLearnerSession } from "./auth/useLearnerSession";
import { LearnerI18nProvider } from "./i18n/LearnerI18nProvider";
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
 *
 * `bootstrapLearnerSession()` is idempotent (see its docstring), so
 * React StrictMode's double-invoke of effects in development is safe.
 */
export function LearnerProviders({ children }: { children: React.ReactNode }) {
  const locale = useLocale();
  const status = useLearnerSession((state) => state.status);
  const userId = useLearnerSession((state) => state.session?.user.id);

  useEffect(() => {
    void bootstrapLearnerSession();
  }, []);

  useEffect(() => {
    initPostHog();
  }, []);

  useEffect(() => {
    if (status === "authenticated" && userId) {
      identifyUser(userId);
    } else if (status === "unauthenticated") {
      resetAnalyticsUser();
    }
  }, [status, userId]);

  return (
    <LearnerI18nProvider lng={locale}>
      <OfflineBanner />
      <LearnerErrorBoundary>{children}</LearnerErrorBoundary>
    </LearnerI18nProvider>
  );
}
