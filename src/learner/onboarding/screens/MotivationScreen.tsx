"use client";

import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useTranslation } from "react-i18next";
import clsx from "clsx";

import { trackEvent } from "@/learner/core/analytics/posthog";
import { AppText } from "@/learner/ui/primitives";
import { useFinishOnboarding } from "@/learner/onboarding/useFinishOnboarding";
import {
  useOnboardingAnswers,
  type OnboardingMotivation,
} from "@/learner/onboarding/state/useOnboardingAnswers";

const MOTIVATIONS: OnboardingMotivation[] = ["travel", "work", "studies", "immigration", "other"];

/**
 * Onboarding step 2/3 — motivation. Web port of
 * `deutschfit-mobile/src/features/onboarding/screens/MotivationScreen.tsx`.
 *
 * "Ignorer" runs the same finalize sequence as Schedule's auto-finish
 * (`finish()` then `router.replace`) rather than merely skipping ahead —
 * mobile parity: any exit before the wizard's last step still needs to
 * mark onboarding done so the gate stops re-prompting.
 */
export function MotivationScreen() {
  const { t } = useTranslation(["onboarding"]);
  const router = useRouter();
  const locale = useLocale();
  const motivation = useOnboardingAnswers((s) => s.motivation);
  const setMotivation = useOnboardingAnswers((s) => s.setMotivation);
  const { busy, finish } = useFinishOnboarding();

  async function handleSkip(): Promise<void> {
    await finish();
    router.replace(`/${locale}/app`);
  }

  function handleContinue(): void {
    if (motivation === null) return;
    trackEvent("onboarding_step_completed", { step: "motivation", index: 2 });
    router.push(`/${locale}/app/onboarding/schedule`);
  }

  return (
    <div className="flex flex-1 flex-col gap-4" data-testid="onboarding-motivation-screen">
      <div className="flex items-center justify-between">
        <AppText tone="tertiary" size="small">
          {t("onboarding:progress", { current: 2, total: 3 })}
        </AppText>
        <button
          type="button"
          data-testid="onboarding-skip"
          disabled={busy}
          onClick={() => {
            void handleSkip();
          }}
          className="underline disabled:cursor-not-allowed"
        >
          <AppText tone="secondary" size="small">
            {t("onboarding:skip")}
          </AppText>
        </button>
      </div>

      <AppText tone="primary" size="h1" weight="semi" family="serif" className="mt-2 mb-4">
        {t("onboarding:motivation.title")}
      </AppText>

      <div className="flex flex-1 flex-col gap-2" role="radiogroup">
        {MOTIVATIONS.map((opt) => (
          <button
            key={opt}
            type="button"
            role="radio"
            aria-checked={motivation === opt}
            data-testid={`onboarding-motivation-option-${opt}`}
            onClick={() => setMotivation(opt)}
            className={clsx(
              "min-h-14 rounded-[var(--radius-md)] border bg-bg-card px-4 text-left",
              "transition hover:opacity-85",
              motivation === opt ? "border-accent-gold" : "border-line-strong"
            )}
          >
            <AppText weight="medium">{t(`onboarding:motivation.options.${opt}`)}</AppText>
          </button>
        ))}
      </div>

      <button
        type="button"
        data-testid="onboarding-motivation-continue"
        disabled={motivation === null}
        onClick={handleContinue}
        className={clsx(
          "min-h-13 rounded-[var(--radius-md)] bg-text-primary transition",
          "disabled:cursor-not-allowed disabled:opacity-50"
        )}
      >
        <AppText tone="inverse" weight="semi">
          {t("onboarding:continue")}
        </AppText>
      </button>
    </div>
  );
}
