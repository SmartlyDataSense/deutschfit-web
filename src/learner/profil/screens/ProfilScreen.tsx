"use client";

/**
 * `ProfilScreen` — web port of
 * `mobile/src/features/profil/screens/ProfilScreen.tsx`.
 * Deltas: S11-D1 (routes), S11-D3 (sign-out dialog), S11-D4 (no
 * notifications row), S11-D5 (mount fetch), S11-D6 (suggestions i18n),
 * S11-D7 (privacy = internal legal page), S11-D11 (settings text
 * button, no cog glyph). Degamified like mobile: no metrics, no XP, no
 * fullPrep monetization card (hard product lock).
 *
 * Row grouping (S11.4 decision, see `SettingsRow.tsx` docstring): rows
 * are flat and share one rounded `bg-bg-card` surface per section, split
 * by a hairline divider (`divide-y divide-line-soft`). Mobile's own
 * ProfilScreen groups rows in a container with no background at all
 * (fully transparent on the hero background); the shared-card-with-
 * dividers look here is borrowed from `SettingsScreen.tsx`'s pattern
 * (`features/settings/screens/SettingsScreen.tsx`, its `styles.card` —
 * a different mobile screen), not ported from anything ProfilScreen
 * itself renders.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useTranslation } from "react-i18next";

import { Icon } from "@/learner/core/icons/Icon";
import { AppText } from "@/learner/ui/primitives";
import { useLearnerSession } from "@/learner/core/auth/useLearnerSession";
import { hydrateExamContext, useExamContextStore } from "@/learner/core/exam/examContext";
import { formatExamTrackLabel } from "@/learner/core/exam/examTypes";

import { useProfilStats } from "../hooks/useProfilStats";
import { IdentityCard } from "../components/IdentityCard";
import { SettingsRow } from "../components/SettingsRow";

export function ProfilScreen() {
  const router = useRouter();
  const locale = useLocale();
  const { t } = useTranslation(["profil", "settings"]);
  const session = useLearnerSession((state) => state.session);
  const signOut = useLearnerSession((state) => state.signOut);
  const { stats } = useProfilStats(session?.user.id ?? null);
  const board = useExamContextStore((state) => state.board);
  const level = useExamContextStore((state) => state.level);
  const isLoaded = useExamContextStore((state) => state.isLoaded);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const signOutDialogRef = useRef<HTMLDivElement | null>(null);

  // Focus-on-open (ConfirmExamChangeModal precedent). `AppButton` doesn't
  // forward refs, so focus lands on the dialog card div itself
  // (`tabIndex={-1}`) rather than the confirm button.
  useEffect(() => {
    if (confirmingSignOut) signOutDialogRef.current?.focus();
  }, [confirmingSignOut]);

  // Per-screen exam-context hydration (web convention — no ancestor layout
  // does it; precedent AccueilScreen.tsx:103). Without this a direct load
  // leaves `isLoaded` false forever and the pill sticks on the stats
  // fallback. `hydrate()` is idempotent and StrictMode-safe (the store's
  // own `set()` calls are safe post-unmount — no local state to guard).
  useEffect(() => {
    void hydrateExamContext();
  }, []);

  const examLabel = isLoaded ? formatExamTrackLabel(board, level) : stats.examLabel;
  const go = (suffix: string) => () => router.push(`/${locale}${suffix}`);

  const handleSignOut = (): void => {
    if (signingOut) return;
    setSigningOut(true);
    void (async () => {
      await signOut();
      router.replace(`/${locale}/app/login`);
    })();
  };

  return (
    <div
      className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8 lg:px-8"
      data-testid="profil-screen"
    >
      <div className="flex items-center gap-3" data-testid="profil-navbar">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label={t("profil:header.backA11y")}
          data-testid="profil-back-button"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-bg-card transition hover:opacity-90"
        >
          <Icon name="back" size={18} label={t("profil:header.backA11y")} />
        </button>
        <AppText
          as="h1"
          tone="primary"
          family="serif"
          size="h3"
          weight="bold"
          className="flex-1 text-center"
        >
          {t("profil:title")}
        </AppText>
        <button
          type="button"
          onClick={go("/app/profil/settings")}
          aria-label={t("profil:header.settingsA11y")}
          data-testid="profil-settings-button"
          className="rounded-full bg-bg-card px-3 py-2 transition hover:opacity-90"
        >
          <AppText size="small" weight="medium" tone="primary">
            {t("settings:title")}
          </AppText>
        </button>
      </div>

      <IdentityCard stats={stats} examPill={examLabel} testID="profil-identity-card" />

      <div
        className="flex flex-col divide-y divide-line-soft rounded-[var(--radius-lg)] bg-bg-card"
        data-testid="profil-settings-list"
      >
        <SettingsRow
          label={t("profil:settings.changeExam")}
          value={examLabel}
          onClick={go("/app/profil/settings/exam-track")}
          testID="profil-settings-change-exam"
        />
        <SettingsRow
          label={t("profil:settings.changeExamDate")}
          ariaLabel={t("profil:settings.changeExamDateA11y")}
          onClick={go("/app/exam-date")}
          testID="profil-settings-change-exam-date"
        />
        <SettingsRow
          label={t("profil:history.row")}
          ariaLabel={t("profil:history.rowA11y")}
          onClick={go("/app/history")}
          testID="profil-settings-history"
        />
        <SettingsRow
          label={t("profil:settings.suggestions")}
          ariaLabel={t("profil:settings.suggestionsA11y")}
          onClick={go("/app/coach")}
          testID="profil-settings-suggestions"
        />
      </div>

      <div className="flex flex-col gap-2" data-testid="profil-account-section">
        <AppText size="caption" weight="semi" tone="tertiary" className="mt-2 uppercase">
          {t("profil:account.sectionTitle")}
        </AppText>
        <div className="flex flex-col divide-y divide-line-soft rounded-[var(--radius-lg)] bg-bg-card">
          <SettingsRow
            label={t("profil:account.privacy")}
            ariaLabel={t("profil:account.privacyA11y")}
            href={`/${locale}/legal/privacy`}
            testID="profil-account-privacy"
          />
          <SettingsRow
            label={t("profil:account.signOut")}
            ariaLabel={t("profil:account.signOutA11y")}
            onClick={() => setConfirmingSignOut(true)}
            testID="profil-account-sign-out"
          />
          <SettingsRow
            label={t("profil:account.deleteAccount")}
            ariaLabel={t("profil:account.deleteAccountA11y")}
            tone="warning"
            onClick={go("/app/profil/delete-account")}
            testID="profil-account-delete"
          />
        </div>
      </div>

      {confirmingSignOut ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-premium-black)]/60 p-4"
          onClick={() => setConfirmingSignOut(false)}
        >
          <div
            ref={signOutDialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-label={`${t("profil:account.signOutConfirmTitle")}. ${t("profil:account.signOutConfirmMessage")}`}
            tabIndex={-1}
            data-testid="profil-signout-dialog"
            className="w-full max-w-sm rounded-[var(--radius-lg)] bg-bg-card p-6 outline-none"
            onClick={(event) => event.stopPropagation()}
          >
            <AppText as="h2" size="h3" weight="bold" family="serif" tone="primary">
              {t("profil:account.signOutConfirmTitle")}
            </AppText>
            <AppText size="body" tone="secondary" className="mt-2">
              {t("profil:account.signOutConfirmMessage")}
            </AppText>
            <div className="mt-6 flex flex-col gap-2">
              <button
                type="button"
                data-testid="profil-signout-confirm"
                onClick={handleSignOut}
                disabled={signingOut}
                className="min-h-11 rounded-full bg-bg-premium px-4 transition hover:opacity-90 disabled:opacity-50"
              >
                <AppText size="body" weight="semi" tone="inverse">
                  {t("profil:account.signOut")}
                </AppText>
              </button>
              <button
                type="button"
                data-testid="profil-signout-cancel"
                onClick={() => setConfirmingSignOut(false)}
                className="min-h-11 rounded-full px-4 transition hover:bg-cream-deep"
              >
                <AppText size="body" weight="medium" tone="primary">
                  {t("profil:account.signOutCancel")}
                </AppText>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
