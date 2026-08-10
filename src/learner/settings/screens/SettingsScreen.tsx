"use client";

/**
 * `SettingsScreen` — web port of
 * `mobile/src/features/settings/screens/SettingsScreen.tsx`.
 * Deltas: S11-D2 (language = flag + URL prefix swap), S11-D8 (legal
 * links enabled — mobile disables them for v1.0, web has real internal
 * pages so the affordance is live), S11-D15 (version from package.json,
 * not `Constants.expoConfig`), S11-D16 (dev gallery link actually
 * navigates — mobile's dev row is a disabled placeholder), S11-D11 (no
 * leading icons). Appearance section is NOT ported (mobile doesn't
 * render one either — the keys are dormant since the P0.5 cream-only
 * build).
 *
 * PRODUCT LOCK: no paywall / IAP / premium rows anywhere on this
 * screen, and the app-store `settings:account.deleteSubsHint` copy is
 * never rendered on web (monetization-adjacent and wrong here — see
 * `project_no_inapp_paywall_web_only`).
 */
import { useEffect, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useLocale } from "next-intl";
import { useTranslation } from "react-i18next";

import packageJson from "../../../../package.json";
import { AppText } from "@/learner/ui/primitives";
import { Icon } from "@/learner/core/icons/Icon";
import { hydrateExamContext, useExamContextStore } from "@/learner/core/exam/examContext";
import { formatExamTrackLabel } from "@/learner/core/exam/examTypes";
import { getBackendInfo } from "@/learner/core/api/backendEnv";
import { LEARNER_LANG_STORAGE_KEY, setFlag } from "@/learner/core/storage/flags";
import { SettingsRow } from "@/learner/profil/components/SettingsRow";

const LANG_OPTIONS = ["fr", "en"] as const;
type LangOption = (typeof LANG_OPTIONS)[number];

function Section({
  title,
  testID,
  children,
}: {
  title: string;
  testID?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2" data-testid={testID}>
      <AppText size="caption" weight="semi" tone="tertiary" className="mt-2 uppercase">
        {title}
      </AppText>
      <div className="flex flex-col divide-y divide-line-soft rounded-[var(--radius-lg)] bg-bg-card">
        {children}
      </div>
    </section>
  );
}

export function SettingsScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const { t } = useTranslation(["settings", "profil"]);
  const { board, level, source, isLoaded } = useExamContextStore();
  const backend = getBackendInfo();

  // Per-screen exam-context hydration (precedent AccueilScreen.tsx:103,
  // DrillSessionScreen.tsx:54, ProfilScreen.tsx) — no ancestor layout
  // hydrates the store, so without this `isLoaded` never flips and the
  // exam meta sticks on the unhydrated goethe/b1 fallback.
  useEffect(() => {
    void hydrateExamContext();
  }, []);

  const go = (suffix: string) => () => router.push(`/${locale}${suffix}`);

  const handleLanguage = (next: LangOption): void => {
    if (next === locale) return;
    setFlag(LEARNER_LANG_STORAGE_KEY, next);
    // S11-D2: route locale drives LearnerI18nProvider — swapping the URL
    // prefix IS the language change on web.
    router.replace(pathname.replace(`/${locale}/`, `/${next}/`));
  };

  const examMeta = isLoaded
    ? `${formatExamTrackLabel(board, level)}${
        source === "settings" ? ` · ${t("settings:exam.changedHint")}` : ""
      }`
    : "";

  const envLabel =
    backend.env === "dev"
      ? t("settings:about.envDev")
      : backend.env === "preprod"
        ? t("settings:about.envPreprod")
        : backend.env === "prod"
          ? t("settings:about.envProd")
          : t("settings:about.envUnknown");

  return (
    <div
      className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8 lg:px-8"
      data-testid="settings-screen"
    >
      <div className="flex items-center gap-3" data-testid="settings-navbar">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label={t("profil:header.backA11y")}
          data-testid="settings-back-button"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-bg-card transition hover:opacity-90"
        >
          <Icon name="back" size={18} label={t("profil:header.backA11y")} />
        </button>
        <AppText
          as="h1"
          family="serif"
          size="h3"
          weight="bold"
          tone="primary"
          className="flex-1 text-center"
        >
          {t("settings:title")}
        </AppText>
        <div className="h-9 w-9" aria-hidden="true" />
      </div>

      <section className="flex flex-col gap-2" data-testid="settings-language-section">
        <AppText size="caption" weight="semi" tone="tertiary" className="mt-2 uppercase">
          {t("settings:sections.language")}
        </AppText>
        <div
          role="radiogroup"
          aria-label={t("settings:sections.language")}
          className="flex flex-col gap-2"
        >
          {LANG_OPTIONS.map((option) => {
            const active = option === locale;
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={active}
                data-testid={`settings-language-${option}`}
                onClick={() => handleLanguage(option)}
                className="flex min-h-14 w-full items-center justify-between gap-3 rounded-[var(--radius-md)] bg-bg-card px-4 py-3 text-left transition hover:opacity-90"
              >
                <AppText size="body" weight="medium" tone="primary">
                  {t(`settings:language.${option}`)}
                </AppText>
                {active ? (
                  <AppText size="body" tone="gold" aria-hidden="true">
                    ✓
                  </AppText>
                ) : null}
              </button>
            );
          })}
        </div>
      </section>

      <Section title={t("settings:sections.exam")}>
        <SettingsRow
          label={t("settings:exam.rowLabel")}
          value={examMeta}
          ariaLabel={t("settings:exam.openHint")}
          onClick={go("/app/profil/settings/exam-track")}
          testID="settings-exam-row"
        />
        {/* Mobile renders examSelector.rowMeta as this row's meta text
            (SettingsScreen.tsx:227-228) — keep it on web. */}
        <SettingsRow
          label={t("settings:examSelector.rowLabel")}
          value={t("settings:examSelector.rowMeta")}
          ariaLabel={t("settings:examSelector.openHint")}
          onClick={go("/app/profil/settings/exam-selector")}
          testID="settings-exam-selector-row"
        />
      </Section>

      <Section title={t("settings:sections.objectives")}>
        <SettingsRow
          label={t("settings:objectives.rowLabel")}
          value={t("settings:objectives.rowMeta")}
          ariaLabel={t("settings:objectives.openHint")}
          onClick={go("/app/profil/settings/objectives")}
          testID="settings-objectives-row"
        />
      </Section>

      <section className="flex flex-col gap-2" data-testid="settings-analytics-section">
        <AppText size="caption" weight="semi" tone="tertiary" className="mt-2 uppercase">
          {t("settings:sections.analytics")}
        </AppText>
        <div className="flex min-h-14 w-full items-center justify-between gap-3 rounded-[var(--radius-md)] bg-bg-card px-4 py-3">
          <div className="min-w-0 flex-1">
            <AppText size="body" weight="medium" tone="tertiary">
              {t("settings:analytics.optOutLabel")}
            </AppText>
            <AppText size="caption" tone="tertiary">
              {t("settings:analytics.optOutHint")}
            </AppText>
          </div>
          <span className="rounded-full bg-bg-hero px-2 py-0.5">
            <AppText size="caption" tone="tertiary">
              {t("settings:analytics.comingSoon")}
            </AppText>
          </span>
          {/*
            Inert by construction, not just by appearance: no
            `onChange`/`onClick` handler is wired at all, so there is no
            code path — reachable or not — that could ever write an
            opt-out flag from this control. `disabled` additionally
            blocks it from the DOM's own click/keyboard activation.
            Mobile parity note: mobile's underlying `useAnalyticsOptOut`
            core stays wired (only its UI affordance is gated); the web
            port has no analytics-opt-out storage key at all yet, so
            there's nothing to wire even inertly.
          */}
          <input
            type="checkbox"
            role="switch"
            disabled
            readOnly
            checked={false}
            aria-label={t("settings:analytics.optOutLabel")}
            data-testid="settings-analytics-optout-switch"
          />
        </div>
      </section>

      <Section title={t("settings:sections.account")}>
        <SettingsRow
          label={t("settings:account.delete")}
          tone="warning"
          onClick={go("/app/profil/delete-account")}
          testID="settings-delete-account-row"
        />
      </Section>

      <Section title={t("settings:sections.about")}>
        <div className="px-4 py-3" data-testid="settings-version-row">
          <AppText size="small" tone="secondary">
            {t("settings:about.version", { version: packageJson.version })}
          </AppText>
        </div>
        <div className="px-4 py-3" data-testid="settings-backend-env-row">
          <AppText size="small" tone={backend.env === "prod" ? "secondary" : "warning"}>
            {t("settings:about.environment", { env: envLabel })}
          </AppText>
        </div>
        <div className="px-4 py-3" data-testid="settings-backend-ref-row">
          <AppText size="small" tone="secondary" className="select-text">
            {t("settings:about.backendRef", { ref: backend.projectRef ?? "—" })}
          </AppText>
        </div>
        <SettingsRow
          label={t("settings:about.privacyPolicy")}
          ariaLabel={`${t("settings:about.privacyPolicy")}. ${t("settings:about.linkAccessibilityHint")}`}
          href={`/${locale}/legal/privacy`}
          testID="settings-privacy-row"
        />
        <SettingsRow
          label={t("settings:about.termsOfService")}
          ariaLabel={`${t("settings:about.termsOfService")}. ${t("settings:about.linkAccessibilityHint")}`}
          href={`/${locale}/legal/tos`}
          testID="settings-terms-row"
        />
      </Section>

      {process.env.NODE_ENV === "development" ? (
        <Section title="Developer">
          {/* Dev-only section (S11-D16) — never rendered in a production
              build; the check runs at render time so it can't leak past
              a bundler dead-code-elimination pass either. */}
          <SettingsRow
            label="Screen gallery"
            onClick={go("/app/dev/gallery")}
            testID="settings-dev-gallery-row"
          />
        </Section>
      ) : null}
    </div>
  );
}
