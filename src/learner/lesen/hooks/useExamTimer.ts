"use client";

/**
 * `useExamTimer` — countdown state for the graded Lesen session (Task 4.9).
 * Port of `deutschfit-mobile/src/core/exam/useExamTimer.ts` +
 * `deutschfit-mobile/src/core/exam/timer.ts` (the pure `computeTimerState`/
 * `minutesToMs` helpers), merged into one file — mobile's split exists so
 * `timer.ts` can be imported from multiple exam components; this slice has
 * exactly one consumer (`LesenSessionScreen`), so the >30-line threshold
 * that justifies a standalone hook file doesn't also justify a second
 * standalone pure-logic file.
 *
 * `onExpire` is captured in a ref so a parent passing a fresh `useCallback`
 * identity every render does not cause the interval effect to
 * re-subscribe (mobile's R4-1 fix — a synchronous re-subscribe loop blew
 * the React update-depth cap at runtime).
 */
import { useEffect, useRef, useState } from "react";

export interface TimerComputation {
  /** Whole seconds remaining, clamped to >= 0. */
  readonly remainingSeconds: number;
  /** True once `remainingSeconds` would have gone negative. */
  readonly isExpired: boolean;
  /** Fraction elapsed in [0, 1]. */
  readonly elapsedFraction: number;
}

const SECOND = 1000;
const MINUTE = 60;

export function minutesToMs(minutes: number): number {
  return Math.max(0, Math.floor(minutes)) * MINUTE * SECOND;
}

/**
 * Compute the timer state at `nowMs` for a session that started at
 * `startMs` and lasts `durationMs`. A non-positive duration is the
 * loading placeholder session (`createEmptyExamSession`), not an
 * instantly-over exam — report "untimed", never "expired", so the screen
 * doesn't auto-submit an empty session on frame 1.
 */
export function computeTimerState(
  startMs: number,
  durationMs: number,
  nowMs: number
): TimerComputation {
  if (durationMs <= 0) {
    return { remainingSeconds: 0, isExpired: false, elapsedFraction: 0 };
  }

  const elapsedMs = Math.max(0, nowMs - startMs);
  const remainingMs = durationMs - elapsedMs;
  const remainingSeconds = Math.max(0, Math.ceil(remainingMs / SECOND));
  const elapsedFraction = Math.min(1, Math.max(0, elapsedMs / durationMs));
  return {
    remainingSeconds,
    isExpired: remainingMs <= 0,
    elapsedFraction,
  };
}

export interface UseExamTimerArgs {
  readonly startMs: number;
  readonly durationMs: number;
  readonly tickMs?: number;
  readonly onExpire?: () => void;
}

export function useExamTimer({
  startMs,
  durationMs,
  tickMs = 1000,
  onExpire,
}: UseExamTimerArgs): TimerComputation {
  const [state, setState] = useState<TimerComputation>(() =>
    computeTimerState(startMs, durationMs, Date.now())
  );

  const firedRef = useRef(false);
  const onExpireRef = useRef<(() => void) | undefined>(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    firedRef.current = false;
    setState(computeTimerState(startMs, durationMs, Date.now()));

    const id = setInterval(() => {
      const next = computeTimerState(startMs, durationMs, Date.now());
      setState(next);
      if (next.isExpired && !firedRef.current) {
        firedRef.current = true;
        onExpireRef.current?.();
      }
    }, tickMs);

    return () => clearInterval(id);
  }, [startMs, durationMs, tickMs]);

  return state;
}
