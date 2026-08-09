/**
 * Finish-onboarding orchestration hook.
 *
 * Web port of `deutschfit-mobile/src/features/onboarding/
 * useFinishOnboarding.ts`. Sequence (mobile parity): dedupe concurrent
 * calls via a busy guard; persist the collected answers to Supabase
 * (`persistOnboardingAnswers`) — a soft failure there is `console.warn`ed
 * and swallowed (web deviation: no toast system in S2; the server gate
 * re-prompts onboarding next session if persist truly failed); mark the
 * per-user local onboarding flag done; emit `onboarding_finished` with
 * elapsed time; reset the in-memory answers store.
 *
 * `busyRef` is a deliberate web addition on top of the mobile source:
 * mobile's `busy` state guard alone has a one-render race that React 19
 * concurrent rendering makes observable, so a ref backs the dedupe.
 */
"use client";
import { useCallback, useRef, useState } from "react";

import { trackEvent } from "@/learner/core/analytics/posthog";
import { useOnboardingFlagStore } from "@/learner/core/onboarding/useOnboardingFlag";

import { persistOnboardingAnswers } from "./services/persistOnboardingAnswers";
import { useOnboardingAnswers } from "./state/useOnboardingAnswers";

export type UseFinishOnboardingResult = { busy: boolean; finish: () => Promise<void> };

export function useFinishOnboarding(): UseFinishOnboardingResult {
  const markDone = useOnboardingFlagStore((s) => s.markDone);
  const motivation = useOnboardingAnswers((s) => s.motivation);
  const schedule = useOnboardingAnswers((s) => s.schedule);
  const resetAnswers = useOnboardingAnswers((s) => s.reset);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false); // state alone is async — ref makes the dedupe race-proof
  const mountedAtRef = useRef<number>(Date.now());

  const finish = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const result = await persistOnboardingAnswers({ motivation, schedule });
      if (!result.ok) console.warn("[onboarding] persist failed:", result.reason);
      await markDone();
      trackEvent("onboarding_finished", { took_ms: Date.now() - mountedAtRef.current });
      resetAnswers();
    } catch (err) {
      console.warn("[onboarding] markDone failed:", err);
      busyRef.current = false;
      setBusy(false);
    }
  }, [markDone, motivation, resetAnswers, schedule]);

  return { busy, finish };
}
