"use client";

import { redirect } from "next/navigation";
import { useLocale } from "next-intl";

import { AppText } from "@/learner/ui/primitives";

import { useLearnerSession } from "./useLearnerSession";

/**
 * Auth gate for the learner app's `(protected)` segment.
 *
 * `useLearnerSession`'s `status` is populated client-side by
 * `bootstrapLearnerSession()` (called once from `LearnerProviders`, which
 * sits above this component in the tree). Three branches:
 *
 *   - `"loading"` — session not resolved yet (including the warm-start
 *     synchronous refresh). Render a minimal splash instead of flashing
 *     protected content or bouncing to `/login` on a session that turns
 *     out to be valid a moment later.
 *   - `"unauthenticated"` — redirect to `/{locale}/app/login`. `redirect()`
 *     from `next/navigation` is called during render (not inside an event
 *     handler), which is the supported pattern for Client Components per
 *     Next.js docs. The login route itself lands in a later task — until
 *     then this redirect resolves to Next's default not-found page, which
 *     is an acceptable intermediate state.
 *   - `"authenticated"` — render `children`.
 *
 * `BrandMark` hasn't been ported from mobile yet, so the splash falls back
 * to the wordmark in serif, matching the brief.
 */
export function LearnerGuard({ children }: { children: React.ReactNode }) {
  const status = useLearnerSession((state) => state.status);
  const locale = useLocale();

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream">
        <AppText as="span" size="h2" weight="bold" family="serif">
          DeutschFit
        </AppText>
      </div>
    );
  }

  if (status === "unauthenticated") {
    redirect(`/${locale}/app/login`);
  }

  return <>{children}</>;
}
