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
  type OnboardingSchedule,
} from "@/learner/onboarding/state/useOnboardingAnswers";

const SCHEDULES: readonly { value: OnboardingSchedule; caveat?: "intensif" }[] = [
  { value: "5" },
  { value: "10" },
  { value: "20" },
  { value: "30" },
  { value: "45" },
  { value: "60", caveat: "intensif" },
];

/**
 * Onboarding step 3/3 — schedule. Web port of
 * `deutschfit-mobile/src/features/onboarding/screens/ScheduleScreen.tsx`.
 *
 * This is the wizard finale: no celebration screen (sh-6, founding-doc
 * §17 + §3). Both Continue and "Ignorer" auto-finish — `finish()` marks
 * the per-user onboarding flag done and resets the answers store, then
 * this screen `router.replace`s to `/{locale}/app` itself. Mobile relies
 * on RootNavigator re-rendering once the flag flips; on web the flag flip
 * only stops the onboarding gate from redirecting back in — the screen
 * still has to navigate away explicitly after `finish()` resolves.
 */
export function ScheduleScreen() {
  const { t } = useTranslation(["onboarding"]);
  const router = useRouter();
  const locale = useLocale();
  const schedule = useOnboardingAnswers((s) => s.schedule);
  const setSchedule = useOnboardingAnswers((s) => s.setSchedule);
  const { busy, finish } = useFinishOnboarding();

  async function handleSkip(): Promise<void> {
    await finish();
    router.replace(`/${locale}/app`);
  }

  async function handleContinue(): Promise<void> {
    if (schedule === null) return;
    trackEvent("onboarding_step_completed", { step: "schedule", index: 3 });
    await finish();
    router.replace(`/${locale}/app`);
  }

  return (
    <div className="flex flex-1 flex-col gap-4" data-testid="onboarding-schedule-screen">
      <div className="flex items-center justify-between">
        <AppText tone="tertiary" size="small">
          {t("onboarding:progress", { current: 3, total: 3 })}
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
        {t("onboarding:schedule.title")}
      </AppText>

      <div className="flex flex-1 flex-col gap-2" role="radiogroup">
        {SCHEDULES.map(({ value, caveat }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={schedule === value}
            data-testid={`onboarding-schedule-option-${value}`}
            onClick={() => setSchedule(value)}
            className={clsx(
              "flex min-h-14 flex-col justify-center gap-1 rounded-[var(--radius-md)] border bg-bg-card px-4 text-left",
              "transition hover:opacity-85",
              schedule === value ? "border-accent-gold" : "border-line-strong"
            )}
          >
            <AppText weight="medium">{t(`onboarding:schedule.options.${value}`)}</AppText>
            {caveat === "intensif" ? (
              <AppText
                tone="secondary"
                size="small"
                data-testid={`onboarding-schedule-caveat-${value}`}
              >
                {t("onboarding:schedule.caveat.intensif")}
              </AppText>
            ) : null}
          </button>
        ))}
      </div>

      <button
        type="button"
        data-testid="onboarding-schedule-continue"
        disabled={schedule === null || busy}
        onClick={() => {
          void handleContinue();
        }}
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
