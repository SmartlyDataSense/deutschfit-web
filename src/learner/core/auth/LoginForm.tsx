"use client";

import { useCallback, useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useTranslation } from "react-i18next";

import { getBrowserClient } from "@/lib/supabase/browser";
import { AppButton, AppText, Input } from "@/learner/ui/primitives";

import {
  canRequestOtp,
  canSubmitPassword,
  canVerifyOtp,
  getAuthMode,
  mapAuthErrorKey,
  sanitizeOtpInput,
} from "./loginForm.logic";
import { useLearnerSession } from "./useLearnerSession";

/**
 * Learner login form — password mode (dev/preview default) or 6-digit
 * email OTP mode (production), switched by `NEXT_PUBLIC_AUTH_MODE` via
 * `getAuthMode()`. Ports `deutschfit-mobile`'s
 * `src/features/auth/screens/LoginScreen.tsx` flow: the same two-step OTP
 * UX (request code → enter + verify code) and the same never-raw-error
 * contract — every failure maps through `mapAuthErrorKey`
 * (`loginForm.logic.ts`) to one of the three pre-approved
 * `auth:login.error.*` strings, never a raw Supabase message.
 *
 * Calls `getBrowserClient().auth.*` directly rather than through a shared
 * wrapper (mobile has `core/auth/authMode.ts`; there is no web equivalent
 * yet and this form is currently its only caller) — matches this task's
 * interface contract.
 *
 * Redirect-loop safety: this component never calls `router.replace` from
 * inside a submit handler. It instead watches `useLearnerSession`'s
 * `status` — populated by the `onAuthStateChange` subscription that
 * `bootstrapLearnerSession` set up in `LearnerProviders` (mounted by the
 * parent `(learner)/app/layout.tsx`, above this route) — and redirects to
 * `/{locale}/app` the instant `status` becomes `"authenticated"`, whether
 * that's because the visitor already had a session on load or because a
 * sign-in call just succeeded.
 */
export function LoginForm() {
  const router = useRouter();
  const locale = useLocale();
  const { t } = useTranslation("auth");
  const status = useLearnerSession((state) => state.status);
  const mode = getAuthMode();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace(`/${locale}/app`);
    }
  }, [status, locale, router]);

  const handlePasswordSubmit = useCallback(async () => {
    setErrorKey(null);
    setLoading(true);
    const supabase = getBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (error) {
      setErrorKey(mapAuthErrorKey(error, "password"));
    }
    // On success, `onAuthStateChange` (subscribed in `bootstrapLearnerSession`)
    // flips `status` to "authenticated" and the effect above navigates.
  }, [email, password]);

  const handleRequestOtp = useCallback(async () => {
    setErrorKey(null);
    setLoading(true);
    const supabase = getBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false },
    });
    setLoading(false);
    if (error) {
      setErrorKey(mapAuthErrorKey(error, "otpRequest"));
      return;
    }
    setOtpSent(true);
  }, [email]);

  const handleVerifyOtp = useCallback(async () => {
    setErrorKey(null);
    setLoading(true);
    const supabase = getBrowserClient();
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: otp,
      type: "email",
    });
    setLoading(false);
    if (error) {
      setErrorKey(mapAuthErrorKey(error, "otpVerify"));
    }
  }, [email, otp]);

  // While the session store is still resolving, or once it's resolved to
  // "authenticated" (the redirect effect above is about to navigate away),
  // show the same minimal splash `LearnerGuard` uses instead of flashing
  // the form.
  if (status === "loading" || status === "authenticated") {
    return (
      <div className="flex min-h-80 items-center justify-center">
        <AppText as="span" size="h2" weight="bold" family="serif">
          DeutschFit
        </AppText>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <AppText as="h1" size="h2" weight="bold" family="serif">
        {t("login.title")}
      </AppText>

      <Input
        id="login-email"
        testID="login-email"
        type="email"
        autoComplete="email"
        label={t("login.emailLabel")}
        placeholder={t("login.emailPlaceholder")}
        value={email}
        onChange={(event: ChangeEvent<HTMLInputElement>) => setEmail(event.target.value)}
        disabled={loading}
      />

      {mode === "password" ? (
        <div className="flex flex-col gap-2">
          <Input
            id="login-password"
            testID="login-password"
            type="password"
            autoComplete="current-password"
            label={t("login.passwordLabel")}
            placeholder={t("login.passwordPlaceholder")}
            value={password}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setPassword(event.target.value)}
            disabled={loading}
          />
          <Link
            href="/auth/reset-password"
            className="self-end text-small text-text-tertiary underline"
          >
            {t("login.forgotPassword")}
          </Link>
        </div>
      ) : otpSent ? (
        <Input
          id="login-otp"
          testID="login-otp"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          label={t("login.otpLabel")}
          placeholder={t("login.otpPlaceholder")}
          value={otp}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            setOtp(sanitizeOtpInput(event.target.value))
          }
          disabled={loading}
        />
      ) : null}

      {errorKey ? (
        <AppText tone="warning" size="small" testID="login-error">
          {t(errorKey)}
        </AppText>
      ) : null}

      {mode === "password" ? (
        <AppButton
          testID="login-submit"
          label={t("login.submit")}
          loading={loading}
          disabled={!canSubmitPassword(email, password, loading)}
          onClick={() => void handlePasswordSubmit()}
        />
      ) : otpSent ? (
        <div className="flex flex-col gap-2">
          <AppButton
            testID="login-verify-otp"
            label={t("login.verifyOtp")}
            loading={loading}
            disabled={!canVerifyOtp(email, otp, loading)}
            onClick={() => void handleVerifyOtp()}
          />
          <AppButton
            testID="login-resend-otp"
            variant="ghost"
            label={t("login.resendOtp")}
            loading={loading}
            disabled={!canRequestOtp(email, loading)}
            onClick={() => void handleRequestOtp()}
          />
        </div>
      ) : (
        <AppButton
          testID="login-send-otp"
          label={t("login.sendOtp")}
          loading={loading}
          disabled={!canRequestOtp(email, loading)}
          onClick={() => void handleRequestOtp()}
        />
      )}
    </div>
  );
}
