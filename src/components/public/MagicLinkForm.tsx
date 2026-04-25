"use client";

import { useActionState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Button, Input, Text } from "@/components/primitives";
import {
  requestMagicLink,
  type LoginActionState,
} from "@/app/[locale]/(public)/account/login/actions";

const initialState: LoginActionState = { status: "idle" };

/**
 * Magic-link sign-in form. State is owned by a server action so we don't
 * need a Supabase client in the browser bundle for auth — `@supabase/ssr`'s
 * server client (in `requestMagicLink`) calls `signInWithOtp`.
 */
export function MagicLinkForm() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const [state, formAction, isPending] = useActionState(requestMagicLink, initialState);

  if (state.status === "ok") {
    return (
      <Text variant="body" className="mt-6 text-text-primary">
        {t("checkInbox")}
      </Text>
    );
  }

  return (
    <form action={formAction} className="mt-6 grid gap-3" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <label className="grid gap-1.5">
        <span className="text-sm font-medium text-text-secondary">{t("emailLabel")}</span>
        <Input
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder={t("emailPlaceholder")}
        />
      </label>
      <Button type="submit" variant="primary" disabled={isPending}>
        {t("submit")}
      </Button>
      {state.status === "error" ? (
        <Text variant="small" className="text-warning-red">
          {t("errorGeneric")}
        </Text>
      ) : null}
    </form>
  );
}
