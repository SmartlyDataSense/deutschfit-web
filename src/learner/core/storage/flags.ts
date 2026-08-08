/**
 * localStorage flag helpers for the learner app.
 *
 * Key names are copied verbatim from `deutschfit-mobile`'s AsyncStorage
 * call sites so a value set on one platform reads the same way
 * conceptually on the other (mobile uses AsyncStorage, web uses
 * localStorage — the storage engines differ, but the key strings and
 * `"true"`-literal semantics are shared):
 *   - `src/core/i18n/index.ts`               → `LANG_STORAGE_KEY`
 *   - `src/core/onboarding/useOnboardingFlag.ts` → onboarding-done (legacy global + per-user)
 *   - `src/features/sprechen/hooks/useMicCheckFlag.ts` → `MIC_CHECK_PASSED_KEY`
 *   - `src/features/coach/hooks/useCoachOpenerFlag.ts` → coach-opener-seen (per-user)
 *   - `src/core/analytics/optOut.ts`          → `ANALYTICS_OPT_OUT_KEY`
 *
 * SSR-safe: every helper guards on `typeof window` so calling from a
 * server component / module-evaluation context is a safe no-op instead
 * of throwing.
 *
 * Testing caveat: jsdom's `window.localStorage` is unreliable under this
 * repo's Node/vitest combo (see `tests/unit/learner-i18n.test.ts`) —
 * tests must install a minimal in-memory `Storage` mock on `window`
 * rather than relying on jsdom's built-in implementation.
 */
import { LEARNER_LANG_STORAGE_KEY } from "../i18n";

/** Re-exported so `flags.ts` is a one-stop registry of every learner storage key. */
export { LEARNER_LANG_STORAGE_KEY };

export const LEARNER_ANALYTICS_OPT_OUT_KEY = "@deutschfit/analytics-opt-out";

export const LEARNER_MIC_CHECK_PASSED_KEY = "@deutschfit/sprechen-mic-check-passed";

/** Legacy pre-per-user global onboarding flag key — mobile's backwards-compat shim. */
export const LEARNER_ONBOARDING_DONE_LEGACY_KEY = "@deutschfit/onboarding-done";
const LEARNER_ONBOARDING_DONE_KEY_PREFIX = "@deutschfit/onboarding-done/";

const LEARNER_COACH_OPENER_SEEN_KEY_PREFIX = "@deutschfit/coach-opener-seen/";

/** Per-user onboarding-done key, mirroring mobile's `perUserStorageKey` in `useOnboardingFlag.ts`. */
export function learnerOnboardingDoneKeyFor(userId: string): string {
  return `${LEARNER_ONBOARDING_DONE_KEY_PREFIX}${userId}`;
}

/** Per-user coach-opener-seen key, mirroring mobile's `perUserStorageKey` in `useCoachOpenerFlag.ts`. */
export function learnerCoachOpenerSeenKeyFor(userId: string): string {
  return `${LEARNER_COACH_OPENER_SEEN_KEY_PREFIX}${userId}`;
}

/** Reads a flag from localStorage. Returns `null` on SSR, when unset, or if localStorage throws. */
export function getFlag(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    // localStorage unavailable (private mode, disabled storage, quota) — best-effort no-op.
    return null;
  }
}

/** Writes a flag to localStorage. No-op on SSR or if localStorage throws. */
export function setFlag(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // best-effort no-op
  }
}

/** Removes a flag from localStorage. No-op on SSR or if localStorage throws. */
export function removeFlag(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // best-effort no-op
  }
}
