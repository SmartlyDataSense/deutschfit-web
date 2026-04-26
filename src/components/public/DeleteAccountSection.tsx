import { getTranslations } from "next-intl/server";
import { Card, Text } from "@/components/primitives";
import { deleteAccount } from "@/app/[locale]/(public)/account/actions";

type Props = {
  locale: string;
  status?: "invalid_confirm" | "failed" | null;
};

/**
 * Danger-zone section on /account that lets a signed-in user erase their
 * account. Implements the Apple App Privacy "data deletion URL" requirement
 * (Review Guideline 5.1.1(v)) — the mobile app is the primary path; this is
 * the web-accessible fallback for any user who has lost access to the
 * binary and for App Review's questionnaire.
 *
 * The destructive action is gated behind a typed `DELETE` confirmation
 * (English-only safety token, intentionally not localized — same constant
 * used in the mobile flow per the spec's open-question resolution). The
 * server action `deleteAccount` calls the `account-delete` Supabase edge
 * function which is the single source of truth for the destructive
 * sequence (audit row → storage scrub → auth.admin.deleteUser).
 */
export async function DeleteAccountSection({ locale, status }: Props) {
  const t = await getTranslations("account.delete");

  return (
    <Card id="delete" className="mt-8 border-red-200">
      <Text variant="h3" as="h2" className="text-text-primary">
        {t("heading")}
      </Text>
      <Text variant="small" className="mt-2 text-text-secondary">
        {t("subtitle")}
      </Text>

      <details className="group mt-4">
        <summary className="cursor-pointer text-sm font-semibold text-red-700 hover:text-red-800">
          {t("disclosureLabel")}
        </summary>

        <form action={deleteAccount} className="mt-4 space-y-3">
          <input type="hidden" name="locale" value={locale} />

          <Text variant="body" className="text-text-secondary">
            {t("body1")}
          </Text>
          <Text variant="body" className="text-text-secondary">
            {t("body2")}
          </Text>
          <Text variant="body" className="font-semibold text-text-primary">
            {t("irreversible")}
          </Text>
          <Text variant="small" className="text-text-tertiary">
            {t("subsHint")}
          </Text>

          <label htmlFor="account-delete-confirm" className="block text-sm text-text-secondary">
            {t("confirmLabel")}
          </label>
          <input
            id="account-delete-confirm"
            name="confirm"
            type="text"
            required
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            placeholder={t("confirmPlaceholder")}
            className="w-full rounded-md border border-line-strong bg-bg-card px-3 py-2 text-base text-text-primary placeholder:text-text-tertiary focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-600"
          />

          {status === "invalid_confirm" ? (
            <Text variant="small" className="text-red-700">
              {t("errorInvalidConfirm")}
            </Text>
          ) : null}
          {status === "failed" ? (
            <Text variant="small" className="text-red-700">
              {t("errorFailed")}
            </Text>
          ) : null}

          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2"
          >
            {t("confirmCta")}
          </button>
        </form>
      </details>
    </Card>
  );
}
