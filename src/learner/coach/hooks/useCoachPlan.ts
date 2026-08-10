/**
 * `useCoachPlan` — loads the learner's weekly coach plan (S9 · Task 9.2).
 *
 * Ports `deutschfit-mobile/src/features/coach/hooks/useCoachPlan.ts`
 * verbatim, swapping the `@core/api/coach` import for this repo's
 * `@/learner/coach/planApi`.
 *
 * Wraps `getCoachPlan()` + `deriveObservation()`. Returns a phase + a
 * derived observation payload. When the call fails or the learner is
 * unauthenticated, the hook surfaces `fallback: true` — the Coach chat
 * screen falls back to the scripted i18n transcript and shows a subtle
 * "Connecte-toi pour l'analyse" banner.
 *
 * The hook does not track polling or retries beyond a single load: the
 * coach plan is cached 24h server-side, so a single fetch on mount is
 * sufficient. Callers that want manual refresh call `refresh()`.
 */
import { useCallback, useEffect, useState } from "react";

import {
  deriveObservation,
  getCoachPlan,
  type CoachObservationPayload,
  type CoachPlanResponse,
} from "../planApi";

export type CoachPlanPhase = "idle" | "loading" | "ready" | "error";

export type UseCoachPlanState = {
  readonly phase: CoachPlanPhase;
  readonly plan: CoachPlanResponse | null;
  readonly observation: CoachObservationPayload | null;
  readonly error: string | null;
  readonly fallback: boolean;
};

export type UseCoachPlanArgs = {
  /** Disable automatic fetch (e.g. during tests or offline sessions). */
  readonly enabled?: boolean;
  readonly deps?: {
    readonly getCoachPlan?: typeof getCoachPlan;
  };
};

const INITIAL_STATE: UseCoachPlanState = {
  phase: "idle",
  plan: null,
  observation: null,
  error: null,
  fallback: false,
};

export type UseCoachPlanResult = UseCoachPlanState & {
  readonly refresh: () => void;
};

export function useCoachPlan(args: UseCoachPlanArgs = {}): UseCoachPlanResult {
  const enabled = args.enabled ?? true;
  const fetcher = args.deps?.getCoachPlan ?? getCoachPlan;
  const [state, setState] = useState<UseCoachPlanState>(INITIAL_STATE);
  const [generation, setGeneration] = useState(0);

  const refresh = useCallback(() => {
    setGeneration((g) => g + 1);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setState((prev) => ({ ...prev, phase: "loading", error: null }));

    (async () => {
      try {
        const plan = await fetcher();
        if (cancelled) return;
        const observation = deriveObservation(plan);
        setState({
          phase: "ready",
          plan,
          observation,
          error: null,
          fallback: !observation.hasSignal,
        });
      } catch (err) {
        if (cancelled) return;
        const code = err instanceof Error ? err.message : "coach_plan_failed";
        setState({
          phase: "error",
          plan: null,
          observation: null,
          error: code,
          fallback: true,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, fetcher, generation]);

  return { ...state, refresh };
}
