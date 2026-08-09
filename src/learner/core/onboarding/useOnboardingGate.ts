"use client";
import { useEffect, useState } from "react";

import { useLearnerSession } from "@/learner/core/auth/useLearnerSession";

import { hasDiagnosticOnServer, readOnboardedAt } from "./onboardingStatus";
import {
  markOnboardingDoneFor,
  readOnboardingDoneFor,
  useOnboardingFlagStore,
} from "./useOnboardingFlag";

export interface OnboardingGateState {
  checked: boolean;
  done: boolean;
}

/**
 * Decides whether the signed-in learner has completed onboarding, per the
 * decision chain in the S2 brief:
 *
 *   1. No `userId` — the guard above (`LearnerGuard`) handles auth; report
 *      `{ checked: false, done: false }` so callers keep rendering their
 *      splash instead of prematurely redirecting.
 *   2. Local per-user flag `"true"` — done immediately, no network call.
 *   3. `readOnboardedAt` — a non-null stamp means done. Back-fills the
 *      local flag via `markOnboardingDoneFor` so future loads skip the
 *      network entirely.
 *   4. `hasDiagnosticOnServer` — a diagnostic row present covers legacy
 *      accounts from before `onboarded_at` existed. Also back-fills the
 *      flag.
 *   5. Any lookup error — fail OPEN into onboarding (mobile parity: a
 *      `present: null` lookup lands on the Onboarding branch there too).
 *      A wrongly-shown wizard is recoverable; a wrongly-skipped one is
 *      not.
 *
 * Also subscribes to `useOnboardingFlagStore.done` so `markDone()` fired
 * during the onboarding finish flow flips every consumer of this hook
 * immediately, without a server round-trip.
 */
export function useOnboardingGateCheck(): OnboardingGateState {
  const userId = useLearnerSession((s) => s.session?.user.id ?? null);
  const flagDone = useOnboardingFlagStore((s) => s.done);
  const [state, setState] = useState<OnboardingGateState>({ checked: false, done: false });

  useEffect(() => {
    if (!userId) {
      setState({ checked: false, done: false });
      return;
    }
    if (readOnboardingDoneFor(userId)) {
      setState({ checked: true, done: true });
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const stamped = await readOnboardedAt(userId);
        const done = stamped !== null ? true : await hasDiagnosticOnServer(userId);
        if (done) markOnboardingDoneFor(userId); // accelerate future loads
        if (!cancelled) setState({ checked: true, done });
      } catch {
        // Fail-open INTO onboarding (mobile parity: `present: null` → Onboarding branch).
        if (!cancelled) setState({ checked: true, done: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // `markDone()` during the finish flow flips the flag store — surface it
  // without re-querying the server.
  if (state.checked && !state.done && flagDone) return { checked: true, done: true };
  return state;
}
