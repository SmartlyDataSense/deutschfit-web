/**
 * Coach-opener-seen flag (S9 · Task 9.2 — per-user, mirrors mobile's
 * `deutschfit-mobile/src/features/coach/hooks/useCoachOpenerFlag.ts`).
 *
 * Stored under `@deutschfit/coach-opener-seen/<userId>` (D4). Presence of
 * the literal string `"true"` for the active user means "the learner has
 * already seen the cold-start opener bubble at least once"; anything else
 * (or no userId) is treated as not-seen.
 *
 * Why? The canned coach opener is a cold-start onboarding affordance.
 * After the first thread it becomes noise — every subsequent thread
 * should start clean so the live chat can speak for itself. Persisting
 * per user mirrors `useOnboardingFlag.ts`'s per-user key scheme so a
 * fresh sign-in restores the cold-start experience for the new user.
 *
 * Web delta: AsyncStorage → the shipped `localStorage` flags helper
 * (`@/learner/core/storage/flags`), same as `useMicCheckFlag.ts` /
 * `useOnboardingFlag.ts`. The key string is reused from
 * `learnerCoachOpenerSeenKeyFor` (already registered in `flags.ts`) rather
 * than re-declared. Store methods keep `Promise<void>` return types for
 * API parity with mobile even though the underlying localStorage calls
 * are synchronous.
 *
 * Hydration happens inside `useEffect` (never during render) for SSR
 * safety — mirrors mobile's self-hydrating `useCoachOpenerFlag(userId)`
 * hook exactly (unlike `useOnboardingFlag`'s centralized
 * `LearnerProviders` hydration).
 *
 * Single-bound-consumer constraint: `useCoachOpenerFlagStore` tracks one
 * `userId` at a time, so `useCoachOpenerFlag(userId)` must be mounted
 * from exactly one place at a time. Mounting it from two components
 * simultaneously with *different* `userId`s makes each one's rehydrate
 * effect perpetually "correct" the store's `userId` back to its own —
 * an infinite rehydrate loop (verified: reliably OOMs). If a second
 * consumer (e.g. a side-menu component) needs `seen`/`hydrated`, read
 * them via `useCoachOpenerFlagStore((s) => s.seen)` directly instead of
 * calling the hook again with the same `userId` — or lift a single
 * `useCoachOpenerFlag(userId)` call and pass its result down.
 */
import { useEffect } from "react";
import { create } from "zustand";

import {
  getFlag,
  learnerCoachOpenerSeenKeyFor,
  removeFlag,
  setFlag,
} from "@/learner/core/storage/flags";

function isUsableUserId(userId: string | null | undefined): userId is string {
  return typeof userId === "string" && userId.length > 0;
}

export async function readCoachOpenerSeenFor(userId: string | null | undefined): Promise<boolean> {
  if (!isUsableUserId(userId)) return false;
  return getFlag(learnerCoachOpenerSeenKeyFor(userId)) === "true";
}

export async function markCoachOpenerSeenFor(userId: string | null | undefined): Promise<void> {
  if (!isUsableUserId(userId)) return;
  setFlag(learnerCoachOpenerSeenKeyFor(userId), "true");
}

export async function resetCoachOpenerSeenFor(userId: string | null | undefined): Promise<void> {
  if (!isUsableUserId(userId)) return;
  removeFlag(learnerCoachOpenerSeenKeyFor(userId));
}

type CoachOpenerFlagStore = {
  /** Currently-bound user id; null when signed-out. */
  userId: string | null;
  seen: boolean;
  hydrated: boolean;
  /**
   * Re-read localStorage scoped to the given user. Pass `null` when the
   * auth state goes back to unauthenticated — the flag flips to `false`
   * so the next signed-in user gets a fresh cold-start opener on their
   * first thread. Only one `userId` can be bound at a time — do not call
   * this (directly, or via a second mounted `useCoachOpenerFlag` with a
   * different `userId`) from two places concurrently, or the two callers
   * will fight over `userId` forever (infinite rehydrate loop, OOMs).
   */
  hydrateFor: (userId: string | null) => Promise<void>;
  /** Persist `seen=true` for the currently-bound user. No-op if signed-out. */
  markSeen: () => Promise<void>;
  /** Clear the flag for the currently-bound user. */
  reset: () => Promise<void>;
};

export const useCoachOpenerFlagStore = create<CoachOpenerFlagStore>((set, get) => ({
  userId: null,
  seen: false,
  hydrated: false,
  hydrateFor: async (userId) => {
    if (!isUsableUserId(userId)) {
      set({ userId: null, seen: false, hydrated: true });
      return;
    }
    const stored = await readCoachOpenerSeenFor(userId);
    set({ userId, seen: stored, hydrated: true });
  },
  markSeen: async () => {
    const { userId } = get();
    if (!isUsableUserId(userId)) return;
    await markCoachOpenerSeenFor(userId);
    set({ seen: true });
  },
  reset: async () => {
    const { userId } = get();
    if (isUsableUserId(userId)) {
      await resetCoachOpenerSeenFor(userId);
    }
    set({ seen: false });
  },
}));

export type UseCoachOpenerFlagResult = {
  /**
   * `true` once the learner has seen the cold-start coach opener at
   * least once. Until `hydrated` is `true` consumers should treat this
   * as indeterminate (don't render the opener yet — wait for hydration
   * so a stale `false` doesn't flash the opener twice).
   */
  seen: boolean;
  markSeen: () => Promise<void>;
  reset: () => Promise<void>;
  hydrated: boolean;
};

/**
 * Hook variant that auto-rehydrates whenever the bound user id changes.
 * Mirrors the read shape of `useOnboardingFlag` so callers pattern-match
 * the same way. Mount this from exactly one component at a time (see the
 * single-bound-consumer constraint on `useCoachOpenerFlagStore` above) —
 * a second simultaneous caller with a different `userId` will infinite-
 * loop rehydrating against the other.
 */
export function useCoachOpenerFlag(userId: string | null | undefined): UseCoachOpenerFlagResult {
  const seen = useCoachOpenerFlagStore((s) => s.seen);
  const hydrated = useCoachOpenerFlagStore((s) => s.hydrated);
  const boundUserId = useCoachOpenerFlagStore((s) => s.userId);
  const markSeen = useCoachOpenerFlagStore((s) => s.markSeen);
  const reset = useCoachOpenerFlagStore((s) => s.reset);

  // Rehydrate for the active user whenever it changes (sign-in / sign-out /
  // user switch). Keeps the store coherent without forcing every caller to
  // wire its own bootstrap. Re-armed on every effect run (Constraint 12) —
  // no one-shot ref guarding this.
  const normalizedUserId = isUsableUserId(userId) ? userId : null;
  useEffect(() => {
    if (boundUserId === normalizedUserId && hydrated) return;
    void useCoachOpenerFlagStore.getState().hydrateFor(normalizedUserId);
  }, [boundUserId, hydrated, normalizedUserId]);

  return { seen, hydrated, markSeen, reset };
}

/**
 * Re-hydrate the store for the given user. Wire this into the learner
 * session bootstrap alongside the onboarding-flag rehydration if/when the
 * flag needs to settle before the first render of the Coach chat screen.
 */
export const hydrateCoachOpenerFlagFor = (userId: string | null): Promise<void> =>
  useCoachOpenerFlagStore.getState().hydrateFor(userId);

/** Test-only escape hatch to reset the module-level zustand store between tests. */
export function __resetCoachOpenerFlagStoreForTests(): void {
  useCoachOpenerFlagStore.setState({ userId: null, seen: false, hydrated: false });
}
