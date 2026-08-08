import { setRequestLocale } from "next-intl/server";

import { LoginForm } from "@/learner/core/auth/LoginForm";

type Props = { params: Promise<{ locale: string }> };

/**
 * Learner login route — password mode (dev/preview default) or 6-digit
 * OTP mode (`NEXT_PUBLIC_AUTH_MODE=otp`), rendered by `LoginForm`. Sibling
 * of `(protected)`, not a child of it, so it stays reachable without a
 * session — `LearnerGuard` redirects unauthenticated visitors here (see
 * `(protected)/layout.tsx`), and `LoginForm` itself redirects away to
 * `/{locale}/app` once `useLearnerSession`'s `status` is `"authenticated"`.
 *
 * `LearnerProviders` (i18n + session bootstrap) is already mounted by the
 * parent `(learner)/app/layout.tsx` — this route renders under it without
 * needing its own provider setup.
 *
 * Layout: single centered column, `max-w-md` constraint — same shape at
 * every viewport (mobile fills the available width under the cap; desktop
 * gets a constrained, centered card instead of a full-bleed form).
 */
export default async function LearnerLoginPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-10">
      <LoginForm />
    </main>
  );
}
