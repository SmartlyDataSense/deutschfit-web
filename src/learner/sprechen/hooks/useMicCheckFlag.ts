/**
 * Sprechen mic-check passed flag (web).
 *
 * Verbatim port of deutschfit-mobile's `useMicCheckFlag`
 * (`deutschfit-mobile/src/features/sprechen/hooks/useMicCheckFlag.ts`) —
 * same zustand store shape (`{passed, hydrated, hydrate, markPassed,
 * reset}`), same `bootstrapMicCheckFlag()` startup analog.
 *
 * Web delta (P5): AsyncStorage → the shipped `localStorage` flags helper
 * (`@/learner/core/storage/flags`). The key
 * `@deutschfit/sprechen-mic-check-passed` already lives there as
 * `LEARNER_MIC_CHECK_PASSED_KEY` (mirrors mobile's `MIC_CHECK_PASSED_KEY`
 * literal) — reused here rather than re-declared, per that file's "one-stop
 * registry of every learner storage key" contract. Presence of the literal
 * string `"true"` means the learner has run the 5-second record + playback
 * check at least once on this device (device-scoped, not per-user — unlike
 * `useOnboardingFlag.ts`'s per-user key scheme).
 */
import { create } from "zustand";
import {
  getFlag,
  LEARNER_MIC_CHECK_PASSED_KEY,
  removeFlag,
  setFlag,
} from "@/learner/core/storage/flags";

export function readMicCheckPassed(): boolean {
  return getFlag(LEARNER_MIC_CHECK_PASSED_KEY) === "true";
}

export function markMicCheckPassedFlag(): void {
  setFlag(LEARNER_MIC_CHECK_PASSED_KEY, "true");
}

export function resetMicCheckFlag(): void {
  removeFlag(LEARNER_MIC_CHECK_PASSED_KEY);
}

type MicCheckFlagStore = {
  passed: boolean;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  markPassed: () => Promise<void>;
  reset: () => Promise<void>;
};

const useMicCheckFlagStore = create<MicCheckFlagStore>((set) => ({
  passed: false,
  hydrated: false,
  // Web delta: mobile's `hydrate`/`markPassed`/`reset` are `async` because
  // AsyncStorage is inherently asynchronous; `getFlag`/`setFlag`/
  // `removeFlag` are synchronous localStorage calls, but the `Promise<void>`
  // return type is kept for API parity — screens written against the
  // mobile-parity contract (`await hydrate()`) work unchanged on web.
  hydrate: async () => {
    set({ passed: readMicCheckPassed(), hydrated: true });
  },
  markPassed: async () => {
    markMicCheckPassedFlag();
    set({ passed: true });
  },
  reset: async () => {
    resetMicCheckFlag();
    set({ passed: false });
  },
}));

export type UseMicCheckFlagResult = {
  passed: boolean;
  hydrated: boolean;
  markPassed: () => Promise<void>;
  reset: () => Promise<void>;
};

export function useMicCheckFlag(): UseMicCheckFlagResult {
  const passed = useMicCheckFlagStore((s) => s.passed);
  const hydrated = useMicCheckFlagStore((s) => s.hydrated);
  const markPassed = useMicCheckFlagStore((s) => s.markPassed);
  const reset = useMicCheckFlagStore((s) => s.reset);
  return { passed, hydrated, markPassed, reset };
}

/**
 * Bootstrap the store from localStorage. Composes with the other startup
 * promises in the learner app bootstrap (mirrors mobile's `App.tsx`
 * composition of `bootstrapSession`/`bootstrapOnboardingFlag`/etc).
 */
export const bootstrapMicCheckFlag = (): Promise<void> => useMicCheckFlagStore.getState().hydrate();

/** Test-only escape hatch to reset the module-level zustand store between tests. */
export function __resetMicCheckFlagStoreForTests(): void {
  useMicCheckFlagStore.setState({ passed: false, hydrated: false });
}
