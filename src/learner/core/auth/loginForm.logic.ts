/**
 * Pure, framework-free logic for `LoginForm` — mode selection, field
 * validation, submit-gating, and error-key mapping. Extracted from the
 * component so it's unit-testable without mounting React or mocking
 * Supabase's browser client (mirrors mobile's `authMode.ts` split between
 * "decide what to show" and "call supabase").
 *
 * Ports `deutschfit-mobile/src/features/auth/screens/LoginScreen.tsx`'s
 * validation gates 1:1 (`emailValid`, `canSubmitPassword`, `canRequestOtp`,
 * `canVerifyOtp`, OTP digit sanitization) and
 * `deutschfit-mobile/src/core/auth/authMode.ts`'s `getAuthMode()` (env-var
 * name changes from `EXPO_PUBLIC_AUTH_MODE` to `NEXT_PUBLIC_AUTH_MODE` per
 * this repo's public-env convention).
 */

export type AuthMode = "password" | "otp";

/**
 * `password` (default — dev/preview, zero email-quota burn) vs `otp`
 * (production, 6-digit email OTP). Mirrors mobile's `getAuthMode()`
 * fallback: any value other than the literal `"otp"` resolves to
 * `"password"`.
 */
export function getAuthMode(): AuthMode {
  return process.env.NEXT_PUBLIC_AUTH_MODE === "otp" ? "otp" : "password";
}

/** Minimal client-side email shape check — mirrors mobile's `emailValid`. */
export function isValidEmail(email: string): boolean {
  return email.trim().length > 0 && email.includes("@");
}

/** Strips non-digits and caps at 6 chars — mirrors mobile's OTP `onChangeText`. */
export function sanitizeOtpInput(value: string): string {
  return value.replace(/[^0-9]/g, "").slice(0, 6);
}

export function canSubmitPassword(email: string, password: string, loading: boolean): boolean {
  return isValidEmail(email) && password.length > 0 && !loading;
}

export function canRequestOtp(email: string, loading: boolean): boolean {
  return isValidEmail(email) && !loading;
}

export function canVerifyOtp(email: string, otp: string, loading: boolean): boolean {
  return isValidEmail(email) && otp.length === 6 && !loading;
}

/**
 * Which auth call failed — determines which i18n error key a non-network
 * failure maps to. `otpRequest` covers `signInWithOtp` (step 1, "send the
 * code"); `otpVerify` covers `verifyOtp` (step 2, "check the code").
 */
export type LoginErrorKind = "password" | "otpRequest" | "otpVerify";

/**
 * True when `error` looks like a connectivity failure rather than a real
 * rejection from the auth server: either a `TypeError` thrown before the
 * request reached the network (the shape `fetch` throws on DNS/offline
 * failures), or supabase-js's own `AuthRetryableFetchError` (`error.name`
 * — see `@supabase/auth-js`'s `errors.ts`), which it raises for transient
 * fetch failures.
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (typeof error !== "object" || error === null) return false;
  return (error as { name?: unknown }).name === "AuthRetryableFetchError";
}

/**
 * Maps a failed auth call to the `auth` namespace i18n key to display.
 * Never surfaces the raw Supabase error string — every branch resolves to
 * one of the three pre-approved `login.error.*` copy strings.
 *
 * - Any connectivity failure (any `kind`) → `login.error.network`.
 * - `password` → `login.error.invalidCredentials`.
 * - `otpVerify` → `login.error.invalidOtp`.
 * - `otpRequest` → `login.error.network` — mirrors mobile's
 *   `handleRequestOtp`, which has no dedicated "couldn't send the code"
 *   copy and always surfaces the network message for step-1 failures.
 */
export function mapAuthErrorKey(error: unknown, kind: LoginErrorKind): string {
  if (isNetworkError(error)) return "login.error.network";
  if (kind === "otpVerify") return "login.error.invalidOtp";
  if (kind === "otpRequest") return "login.error.network";
  return "login.error.invalidCredentials";
}
