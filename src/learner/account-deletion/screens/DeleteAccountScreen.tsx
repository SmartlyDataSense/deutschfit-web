"use client";

/**
 * `DeleteAccountScreen` — web port of
 * `mobile/src/features/account-deletion/screens/DeleteAccountScreen.tsx`.
 *
 * SAFETY CONTRACT (do not weaken):
 *   - deletion requires typing DELETE (trim + uppercase match);
 *   - the CTA is never reachable in a single tap from anywhere — it stays
 *     `disabled` (and thus unclickable and unfocusable-as-active) until
 *     the token matches;
 *   - the client only calls the `account-delete` edge function with the
 *     user's own JWT (via `invokeFn`) — the service-role key NEVER
 *     appears in client code;
 *   - retry after failure only dismisses the error, keeping the typed
 *     token (intent gate preserved, mobile parity — mobile's
 *     `handleDismissError`, DeleteAccountScreen.tsx:87-89).
 *
 * S11-D13: web orchestrates invoke → wipe → analytics reset → signOut →
 * redirect directly in this screen (mobile splits the same sequence
 * across `useAuth.deleteAccount()` / `authMode.deleteAccount()` — see
 * `useAuth.ts:49-57` + `authMode.ts:170-180`). `wipeLocalState` here takes
 * a `userId` (S11-D12 — web clears all learner tables, keyed per-user
 * flags too; see `core/storage/wipe.ts`), unlike mobile's no-arg version
 * (single-user device).
 *
 * PRODUCT LOCK: `settings:account.deleteSubsHint` (app-store subscription
 * copy) is NOT rendered on web — see `project_no_inapp_paywall_web_only`.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useTranslation } from "react-i18next";

import { invokeFn } from "@/learner/core/api/client";
import { resetAnalyticsUser, trackEvent } from "@/learner/core/analytics/posthog";
import { useLearnerSession } from "@/learner/core/auth/useLearnerSession";
import { wipeLocalState } from "@/learner/core/storage/wipe";
import { Icon } from "@/learner/core/icons/Icon";
import { AppText, Input } from "@/learner/ui/primitives";

const CONFIRM_TOKEN = "DELETE";

export function DeleteAccountScreen() {
  const router = useRouter();
  const locale = useLocale();
  const { t } = useTranslation(["settings", "common"]);
  const session = useLearnerSession((state) => state.session);
  const signOut = useLearnerSession((state) => state.signOut);

  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [failed, setFailed] = useState(false);
  const requestedRef = useRef(false);
  // Synchronous re-entrancy guard: `deleting` (state) only takes effect on
  // the next render, so a second click landing before that re-render
  // would still see `disabled={false}` and fire a second in-flight
  // request. `inFlightRef` blocks that within the same tick.
  const inFlightRef = useRef(false);

  const tokenMatches = confirmText.trim().toUpperCase() === CONFIRM_TOKEN;

  // Intentional at-most-once analytics ping (not a data fetch — the ref
  // one-shot idiom is correct here, and there is no async work in this
  // effect to race under StrictMode's double-invoke, so no `cancelled`
  // guard applies). trackEvent is POSITIONAL: (name, properties).
  useEffect(() => {
    if (requestedRef.current) return;
    requestedRef.current = true;
    trackEvent("account_delete_requested", { source: "web" });
  }, []);

  const handleConfirm = (): void => {
    if (!tokenMatches || inFlightRef.current) return;
    inFlightRef.current = true;
    setDeleting(true);
    setFailed(false);
    // Mobile parity: confirmed is tracked BEFORE the network call so the
    // funnel still counts attempts that die in transit.
    trackEvent("account_delete_confirmed", { source: "web" });
    void (async () => {
      try {
        await invokeFn("account-delete", { method: "POST", body: { source: "web" } });
        await wipeLocalState(session?.user.id ?? null);
        resetAnalyticsUser();
        await signOut();
        router.replace(`/${locale}/app/login`);
      } catch (err) {
        const reason = err instanceof Error ? err.message : "unknown_error";
        trackEvent("account_delete_failed", { source: "web", reason });
        setFailed(true);
        setDeleting(false);
        inFlightRef.current = false;
      }
    })();
  };

  return (
    <div
      className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8 lg:px-8"
      data-testid="delete-account"
    >
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => router.back()}
          disabled={deleting}
          aria-label={t("common:actions.close")}
          data-testid="delete-account-close"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-bg-card transition hover:opacity-90 disabled:opacity-50"
        >
          <Icon name="close" size={18} label={t("common:actions.close")} />
        </button>
      </div>

      <AppText
        as="h1"
        family="serif"
        size="h3"
        weight="bold"
        tone="primary"
        testID="delete-account-title"
      >
        {t("settings:account.deleteTitle")}
      </AppText>
      <AppText size="body" tone="secondary">
        {t("settings:account.deleteBody1")}
      </AppText>
      <AppText size="body" tone="secondary">
        {t("settings:account.deleteBody2")}
      </AppText>
      <AppText size="body" weight="semi" tone="warning">
        {t("settings:account.deleteIrreversible")}
      </AppText>
      {/* settings:account.deleteSubsHint deliberately NOT rendered — see
          the product-lock docstring above. */}

      {/* `Input` puts `data-testid` on its WRAPPER div and forwards `id`
          to the real <input> — so tests and e2e must target the element
          by id, `#delete-account-confirm-input` (precedent: the login
          page's `#login-email`). The testID stays on the wrapper. */}
      <Input
        id="delete-account-confirm-input"
        aria-label={t("settings:account.deleteConfirmPlaceholder")}
        placeholder={t("settings:account.deleteConfirmPlaceholder")}
        value={confirmText}
        onChange={(event) => setConfirmText(event.target.value)}
        disabled={deleting}
        autoComplete="off"
        testID="delete-account-confirm-input"
      />

      {failed ? (
        <div
          role="alert"
          data-testid="delete-account-error"
          className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-warning-red bg-bg-card p-4"
        >
          <AppText tone="warning" size="small" weight="semi">
            {t("settings:account.deleteFailedTitle")}
          </AppText>
          <AppText tone="warning" size="small">
            {t("settings:account.deleteFailedBody")}
          </AppText>
          <button
            type="button"
            data-testid="delete-account-error-retry"
            onClick={() => setFailed(false)}
            className="mt-1 min-h-11 self-start rounded-full border border-line-strong px-4 transition hover:bg-cream-deep"
          >
            <AppText size="body" weight="medium" tone="primary">
              {t("settings:account.deleteFailedRetry")}
            </AppText>
          </button>
        </div>
      ) : null}

      <div className="mt-4 flex flex-col gap-2" data-testid="delete-account-footer">
        <button
          type="button"
          data-testid="delete-account-confirm-cta"
          disabled={!tokenMatches || deleting}
          onClick={handleConfirm}
          aria-busy={deleting}
          className="min-h-11 rounded-full bg-warning-red px-4 transition hover:opacity-90 disabled:opacity-45"
        >
          <AppText size="body" weight="semi" tone="inverse">
            {t("settings:account.deleteConfirmCta")}
          </AppText>
        </button>
        <button
          type="button"
          data-testid="delete-account-cancel"
          onClick={() => router.back()}
          disabled={deleting}
          className="min-h-11 rounded-full px-4 transition hover:bg-cream-deep disabled:opacity-50"
        >
          <AppText size="body" weight="medium" tone="primary">
            {t("common:actions.cancel")}
          </AppText>
        </button>
      </div>
    </div>
  );
}
