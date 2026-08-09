"use client";
import { useEffect } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";

import { AppText } from "@/learner/ui/primitives";

import { useOnboardingGateCheck } from "./useOnboardingGate";

/**
 * Onboarding gate for the `(protected)` segment. Sits inside `LearnerGuard`
 * (which already resolved auth) and decides whether the learner still
 * needs the onboarding wizard.
 *
 * `(protected)` and `onboarding/` are sibling segments under `app/` — this
 * component never mounts on `/app/onboarding/*`, so the redirect below
 * cannot loop, and the gate never redirects *away* from onboarding either
 * (deep-linkability is preserved there).
 */
export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { checked, done } = useOnboardingGateCheck();
  const router = useRouter();
  const locale = useLocale();

  useEffect(() => {
    if (checked && !done) router.replace(`/${locale}/app/onboarding`);
  }, [checked, done, locale, router]);

  if (!checked || !done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream">
        <AppText as="span" size="h2" weight="bold" family="serif">
          DeutschFit
        </AppText>
      </div>
    );
  }
  return <>{children}</>;
}
