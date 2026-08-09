/**
 * `useHeroState` — drives the 4-state Accueil Hero (founding-doc §8).
 *
 * Ports `deutschfit-mobile/src/features/accueil/hooks/useHeroState.ts`
 * verbatim (S3 · Task 3.6) — zero RN imports, only the client import path
 * changes (`@core/readiness` → `@/learner/core/readiness`).
 *
 * Wraps the pure state machine `computeHeroState(...)` with the live
 * inputs the home screen has access to:
 *
 *   - `daysUntilExam` ← `useAccueilHome().data.countdown.daysRemaining`
 *   - `submission`     ← `subscribeReadiness()` from the cross-feature
 *     `readinessStore` — Schreiben / Sprechen submit flows pulse the
 *     store via `markSubmissionInFlight(...)` / `markCorrectionReady(...)`,
 *     FeedbackScreen clears it on graded acknowledgement. The signal is
 *     translated into a fresh `graded + correctionUnseen` submission so
 *     the state machine surfaces the §8 post-session pulse line.
 *
 * Cross-feature inputs the `accueil-home` payload doesn't yet expose
 * — queued Betreuer prescription, hours since the last completed
 * session, total `submissionsCount` for the content axis, and the
 * latest `readinessScore` for State B / D — live in features the
 * `accueil` slice cannot import per feature-isolation rules. The hook
 * accepts them via an optional `overrides` argument so the screen — or
 * future push-deep-link receivers — can thread them in once they're
 * plumbed through the home payload. Caller-supplied `overrides` win over
 * the readiness store so tests and future deep-link receivers can pin a
 * deterministic state.
 *
 * Until those inputs land, the hook resolves to the cycle-axis
 * `countdown` branch by default with the content axis decided by
 * `submissionsCount` (defaulting to 0 → State A or C). All mvp-blocker
 * copy is exercised through the unit tests on `computeHeroState`.
 *
 * Test seam: `_accueilHome` lets logic tests inject a deterministic
 * payload without mounting the real hook.
 */
import { useEffect, useState } from "react";

import { getReadiness, subscribeReadiness, type ReadinessSignal } from "@/learner/core/readiness";

import {
  computeHeroState,
  type HeroStateInputs,
  type HeroStatePayload,
  type HeroSubmissionInput,
} from "../heroState";
import { useAccueilHome, type UseAccueilHomeResult } from "./useAccueilHome";

export interface UseHeroStateResult {
  readonly payload: HeroStatePayload;
  readonly state: HeroStatePayload["state"];
  readonly isLoading: boolean;
}

export interface UseHeroStateArgs {
  /**
   * Optional overrides for inputs the `accueil-home` payload doesn't
   * yet expose. Threading them through this argument keeps the
   * feature-isolation rule intact — the home screen aggregates
   * cross-feature inputs and feeds them in once.
   */
  readonly overrides?: HeroStateInputs;
  /**
   * Test seam — inject a pre-built `useAccueilHome` result so the
   * logic tests don't have to mount the real hook (which calls into
   * Supabase). Defaults to the live hook.
   */
  readonly _accueilHome?: UseAccueilHomeResult;
}

const FALLBACK_INPUTS: HeroStateInputs = {
  daysUntilExam: null,
};

/**
 * Translate a `readinessStore` signal into a `HeroSubmissionInput`. A
 * signal in the slot means the learner has a graded correction that
 * has not been acknowledged yet — surfaces the §8 post-session pulse
 * with the readiness-pulse line.
 *
 * `ageHours: 0` keeps the post-session card alive for the freshness
 * window (24 h); the signal is cleared by `FeedbackScreen` when the
 * learner opens the result, which drops the hook back to the prior
 * state.
 */
function signalToSubmission(signal: ReadinessSignal): HeroSubmissionInput {
  // The Hero pulse is driven by slot existence: any slot that has not
  // been acknowledged means the learner has unseen output.
  // `acknowledgeReadiness(...)` clears the slot, which drops this branch
  // and the Hero falls back to the base state.
  void signal;
  return {
    status: "graded",
    ageHours: 0,
    correctionUnseen: true,
  };
}

export function useHeroState(args: UseHeroStateArgs = {}): UseHeroStateResult {
  const liveHome = useAccueilHome({ enabled: args._accueilHome === undefined });
  const home = args._accueilHome ?? liveHome;

  // Subscribe to the cross-feature readiness signal. The store is a
  // single-slot module — re-reading on every render is cheap and the
  // subscription only re-renders when the slot changes.
  const [readiness, setReadiness] = useState<ReadinessSignal | null>(() => getReadiness());
  useEffect(() => {
    setReadiness(getReadiness());
    const unsubscribe = subscribeReadiness((signal) => {
      setReadiness(signal);
    });
    return unsubscribe;
  }, []);

  const baseInputs: HeroStateInputs = home.data
    ? { daysUntilExam: home.data.countdown.daysRemaining }
    : FALLBACK_INPUTS;

  // Layer order (lowest → highest precedence):
  //   1. baseInputs (live `accueil-home` payload)
  //   2. readiness-store signal → synthetic submission override
  //   3. caller-supplied `overrides` (test seam + future deep-links)
  // Caller overrides win so a deterministic test can pin the hero
  // state regardless of ambient store contents.
  //
  // P3 scoping (Wave 1, async-result-experience plan §3.4): only
  // `state === "ready"` slots translate into the post-session pulse.
  // While the slot is `in-flight` (with or without `slow`) the
  // dedicated `<StatusStrip />` mounted under the Hero owns the
  // affordance; the Hero itself stays on the calm countdown branch
  // so the learner doesn't see two competing "we're working on it"
  // surfaces. `failed` slots also stay off the Hero — the strip
  // surfaces the retry CTA without dragging the Hero into a graded
  // layout.
  const readinessInputs: HeroStateInputs =
    readiness && readiness.state === "ready"
      ? { ...baseInputs, submission: signalToSubmission(readiness) }
      : baseInputs;

  const inputs: HeroStateInputs = args.overrides
    ? { ...readinessInputs, ...args.overrides }
    : readinessInputs;

  const payload = computeHeroState(inputs);

  return {
    payload,
    state: payload.state,
    isLoading: home.isLoading && !home.data,
  };
}
