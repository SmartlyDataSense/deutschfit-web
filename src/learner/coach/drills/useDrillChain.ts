/**
 * `useDrillChain` — state owner for the drill-chain runner (S9 · Task
 * 9.5). Ports the state-machine semantics of
 * `deutschfit-mobile/src/features/coach/drills/useDrillChain.ts` (answer
 * → pendingAttempt → next() commits it, idempotent `answer`, `reset`),
 * but returns the bare `DrillChainState` shape declared by the
 * task-9.5-brief's `Produces` contract instead of mobile's flattened
 * `UseDrillChainResult` (`current`/`total`/`correctCount`/`chain` etc.)
 * — the caller (`CoachDrillChainScreen`) already holds the `chain` it
 * passed in, so it derives `current`/`total`/`correctCount` from that
 * plus `state` directly (see the screen's `handleContinue`, which reads
 * `state.attempts` / `state.pendingAttempt` / `state.currentIndex` off
 * the returned `state` object per the brief's snippet verbatim).
 *
 * The hook is intentionally stateless across mounts — a fresh chain
 * starts every time the drill-chain screen mounts. Persistence is a v1
 * concern.
 */
import { useCallback, useState } from "react";

import type { DrillAttempt, DrillChain, DrillChainState } from "./types";

export interface UseDrillChainResult {
  readonly state: DrillChainState;
  /**
   * Submit an answer for the drill at `state.currentIndex`. No-op
   * (returns `null`) once the chain is complete or `currentIndex` is
   * out of range. Idempotent while a `pendingAttempt` already exists —
   * repeated calls return the SAME attempt rather than overwriting it,
   * so a re-render never silently swaps the learner's locked-in pick.
   */
  readonly answer: (selected: string) => DrillAttempt | null;
  /** Commits `pendingAttempt` into `attempts` and advances the cursor. No-op if nothing is pending. */
  readonly next: () => void;
  /** Restarts the chain from the first drill. */
  readonly reset: () => void;
}

const INITIAL: DrillChainState = {
  status: "in_progress",
  currentIndex: 0,
  attempts: [],
  pendingAttempt: null,
};

export function useDrillChain(chain: DrillChain): UseDrillChainResult {
  const [state, setState] = useState<DrillChainState>(INITIAL);
  const total = chain.drills.length;

  const answer = useCallback(
    (selected: string): DrillAttempt | null => {
      if (state.pendingAttempt) return state.pendingAttempt;
      const current = chain.drills[state.currentIndex];
      if (!current) return null;
      const attempt: DrillAttempt = {
        drillId: current.id,
        selected,
        isCorrect: selected === current.answer,
      };
      setState((prev) => ({ ...prev, pendingAttempt: attempt }));
      return attempt;
    },
    [chain, state.currentIndex, state.pendingAttempt]
  );

  const next = useCallback(() => {
    setState((prev) => {
      if (!prev.pendingAttempt) return prev;
      const attempts = [...prev.attempts, prev.pendingAttempt];
      return {
        status: attempts.length >= total ? "complete" : "in_progress",
        currentIndex: prev.currentIndex + 1,
        attempts,
        pendingAttempt: null,
      };
    });
  }, [total]);

  const reset = useCallback(() => {
    setState(INITIAL);
  }, []);

  return { state, answer, next, reset };
}
