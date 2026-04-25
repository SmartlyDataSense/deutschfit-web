"use client";

import { useActionState } from "react";
import { Box, Button, Input, Text } from "@/components/primitives";
import { requestAdminMagicLink, type AdminLoginResult } from "./actions";

type Props = {
  locale: string;
};

const ERROR_COPY: Record<string, string> = {
  invalid_email: "Enter a valid email address.",
  send_failed: "Could not send the magic link — please try again in a moment.",
};

/**
 * Client form for the admin magic-link entry. Uses `useActionState` so the
 * server action can swap between { ok: true } and { ok: false, error }
 * without any client-side fetch boilerplate.
 */
export function AdminLoginForm({ locale }: Props) {
  const [state, formAction, pending] = useActionState<AdminLoginResult | undefined, FormData>(
    requestAdminMagicLink,
    undefined
  );

  if (state?.ok) {
    return (
      <Box className="rounded-md border border-line-soft bg-cream-deep p-6">
        <Text variant="h3" as="h2" className="text-text-primary">
          Check your email
        </Text>
        <Text variant="body" className="mt-3 text-cream-ink">
          If your address is registered as an operator, a sign-in link has been sent. Open it on
          this device to access the back office.
        </Text>
      </Box>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <label className="flex flex-col gap-2">
        <Text variant="small" className="font-semibold text-text-primary">
          Operator email
        </Text>
        <Input
          type="email"
          name="email"
          autoComplete="email"
          required
          placeholder="you@deutschfit.app"
          aria-invalid={state && !state.ok ? true : undefined}
        />
      </label>
      {state && !state.ok ? (
        <Text variant="small" className="text-warning-red">
          {ERROR_COPY[state.error] ?? "Something went wrong."}
        </Text>
      ) : null}
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Sending…" : "Send magic link"}
      </Button>
    </form>
  );
}
