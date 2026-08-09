"use client";

import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useTranslation } from "react-i18next";

import { AppButton, AppText, BrandMark, ProgressBar } from "@/learner/ui/primitives";

const BRAND_MARK_SIZE = 28;
const TEASER_PROGRESS_VALUE = 0.2;

/**
 * Onboarding Welcome — first screen in the wizard (mock #1 parity port of
 * `deutschfit-mobile/src/features/onboarding/screens/OnboardingWelcomeScreen.tsx`).
 *
 * Composition (top → bottom):
 *   1. Brand row     — `BrandMark size={28} tone="onCream"` + wordmark.
 *   2. Eyebrow        — "BIENVENUE" uppercase caption.
 *   3. H1             — "L'allemand, mit Plan." with italic span on the trailing clause.
 *   4. Body           — product claim.
 *   5. Teaser card    — dark premium-token surface: plan eyebrow + duration
 *                       H2 + `ProgressBar` (value 0.2) with "20%" / "Objectif 80" legend.
 *   6. Footer         — pinned to the bottom via `mt-auto`: solid CTA + caption.
 *
 * No hex literals — every color/spacing comes from Tailwind classes backed
 * by the token CSS vars in `globals.css`, same rule as the primitives batch.
 */
export function WelcomeScreen() {
  const router = useRouter();
  const locale = useLocale();
  const { t } = useTranslation(["onboarding"]);

  const handleStart = (): void => {
    router.push(`/${locale}/app/onboarding/exam-type`);
  };

  return (
    <div data-testid="onboarding-welcome-screen" className="flex min-h-screen flex-col">
      <div className="flex flex-1 flex-col gap-6">
        <div className="flex items-center gap-2" data-testid="onboarding-welcome-brand-row">
          <BrandMark tone="onCream" size={BRAND_MARK_SIZE} testID="onboarding-welcome-brandmark" />
          <AppText tone="primary" size="body" weight="semi" testID="onboarding-welcome-wordmark">
            {t("onboarding:welcome.brand")}
          </AppText>
        </div>

        <div className="mt-2 flex flex-col gap-4">
          <AppText tone="tertiary" size="caption" weight="semi" className="tracking-wide uppercase">
            {t("onboarding:welcome.eyebrow")}
          </AppText>

          <AppText
            tone="primary"
            size="h1"
            weight="semi"
            family="serif"
            testID="onboarding-welcome-title"
          >
            {t("onboarding:welcome.titleLead")}
            <AppText
              as="span"
              tone="primary"
              size="h1"
              weight="semi"
              family="serif"
              className="italic"
            >
              {t("onboarding:welcome.titleItalic")}
            </AppText>
          </AppText>

          <AppText tone="secondary" size="body" className="mt-1" testID="onboarding-welcome-body">
            {t("onboarding:welcome.body")}
          </AppText>
        </div>

        <div
          className="flex flex-col gap-2 rounded-[var(--radius-lg)] bg-bg-premium p-6 shadow-md"
          data-testid="onboarding-welcome-teaser"
        >
          <AppText tone="gold" size="caption" weight="semi" className="tracking-wide uppercase">
            {t("onboarding:welcome.teaserEyebrow")}
          </AppText>
          <AppText tone="inverse" size="h2" weight="semi" family="serif">
            {t("onboarding:welcome.teaserTitle")}
          </AppText>
          <div className="mt-2 flex flex-col gap-2">
            <ProgressBar
              value={TEASER_PROGRESS_VALUE}
              tone="gold"
              testID="onboarding-welcome-teaser-progress"
            />
            <div className="flex justify-between">
              <AppText tone="inverse" size="caption" weight="semi" numeric>
                {t("onboarding:welcome.teaserProgress")}
              </AppText>
              <AppText tone="gold" size="caption" weight="semi">
                {t("onboarding:welcome.teaserGoal")}
              </AppText>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-auto flex flex-col gap-2 pt-6" data-testid="onboarding-welcome-footer">
        <AppButton
          label={t("onboarding:welcome.cta")}
          onClick={handleStart}
          variant="solid"
          testID="onboarding-welcome-cta"
        />
        <AppText tone="tertiary" size="small" align="center" className="mt-1">
          {t("onboarding:welcome.ctaCaption")}
        </AppText>
      </div>
    </div>
  );
}
