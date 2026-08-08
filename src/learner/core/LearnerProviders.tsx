"use client";

import { useEffect } from "react";
import { useLocale } from "next-intl";

import { bootstrapLearnerSession } from "./auth/useLearnerSession";
import { LearnerI18nProvider } from "./i18n/LearnerI18nProvider";

/**
 * Client-side provider root for the learner app, mounted by the
 * `(learner)/app` server layout.
 *
 * Two responsibilities:
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
 *      `dev/gallery` and the future `/app/login` route render under this
 *      same provider without being gated, but still benefit from a warm
 *      session store if one becomes relevant to them later.
 *
 * `bootstrapLearnerSession()` is idempotent (see its docstring), so
 * React StrictMode's double-invoke of effects in development is safe.
 */
export function LearnerProviders({ children }: { children: React.ReactNode }) {
  const locale = useLocale();

  useEffect(() => {
    void bootstrapLearnerSession();
  }, []);

  return <LearnerI18nProvider lng={locale}>{children}</LearnerI18nProvider>;
}
