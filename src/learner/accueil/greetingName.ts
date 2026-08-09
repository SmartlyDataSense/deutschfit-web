/**
 * Resolves the name to greet on the Accueil home tab.
 *
 * Ports `deutschfit-mobile/src/features/accueil/greetingName.ts` verbatim
 * (S3 · Task 3.5).
 *
 * Falls through in this order:
 *   1. `displayName` (trimmed) if non-empty.
 *   2. The local-part of `email` (everything before the `@`) if the
 *      email contains an `@` and the local-part is non-empty.
 *   3. The caller-supplied `fallback` (already resolved from i18n).
 *
 * Pure string logic — no React, no i18n, no store access. The caller
 * owns hydration from `useAuth` and translation of the fallback key.
 */
export function greetingName(
  displayName: string | null | undefined,
  email: string | null | undefined,
  fallback: string
): string {
  if (displayName && displayName.trim().length > 0) return displayName.trim();
  if (email && email.includes("@")) {
    const prefix = email.split("@")[0];
    if (prefix) return prefix;
  }
  return fallback;
}
