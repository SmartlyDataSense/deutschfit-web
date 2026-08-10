/**
 * SM-2 spaced-repetition scheduler.
 *
 * A minimal, pure-TS implementation of the SuperMemo 2 algorithm the
 * DeutschFit app uses to drive flashcard review intervals. The function
 * is deterministic and side-effect-free — pass it the current card
 * state plus a rating and it returns the next state.
 *
 * Contract (per `docs/agent-handoff/mock-gap-audit.md` section C #2):
 *   - `again` resets `intervalDays` to 1 and drops ease by 0.2.
 *   - `hard`  keeps the previous interval (minimum 1) and drops ease
 *             by 0.15 — the learner is on the edge of forgetting.
 *   - `good`  grows the interval by the current ease factor, leaving
 *             ease unchanged.
 *   - `easy`  grows the interval faster (×2× ease on graduated cards,
 *             explicit ramp on new ones) and bumps ease by 0.15.
 *
 * Bounds:
 *   - Ease is clamped to [1.3, 2.5]; the SM-2 paper uses 1.3 as a
 *     floor, and we cap at the starting value so repeated "easy"
 *     presses don't drive cards into the future indefinitely.
 *   - Intervals are whole days (no sub-day scheduling — v0 is a daily
 *     review loop). First-pass grads go: again=1d, hard=1d, good=1d,
 *     easy=4d.
 *
 * Callers should persist the returned `easeAfter`, `intervalDaysAfter`
 * and `nextDue` (Unix epoch milliseconds) onto an `srs_reviews` row.
 */
import type { SRSRating } from "@/learner/core/db/types";

export const SM2_EASE_FLOOR = 1.3;
export const SM2_EASE_CEILING = 2.5;
export const SM2_DEFAULT_EASE = 2.5;
export const DAY_MS = 24 * 60 * 60 * 1000;

export interface SM2CardState {
  /** Current ease factor. Fresh cards start at `SM2_DEFAULT_EASE`. */
  readonly ease: number;
  /**
   * Whole days until the next review. Fresh cards use `0` to signal
   * "never scheduled"; the scheduler picks the first-pass ramp below.
   */
  readonly intervalDays: number;
}

export interface SM2Result {
  readonly easeAfter: number;
  readonly intervalDaysAfter: number;
  readonly nextDue: Date;
}

function clampEase(value: number): number {
  if (Number.isNaN(value)) return SM2_EASE_FLOOR;
  if (value < SM2_EASE_FLOOR) return SM2_EASE_FLOOR;
  if (value > SM2_EASE_CEILING) return SM2_EASE_CEILING;
  return value;
}

/**
 * Compute the next review state for a card.
 *
 * `now` is injectable so callers can unit-test deterministically — the
 * default is the wall clock at call time.
 */
export function schedule(
  state: SM2CardState,
  rating: SRSRating,
  now: Date = new Date(),
): SM2Result {
  const isNew = state.intervalDays <= 0;
  // Non-finite ease (NaN / ±Infinity) is treated as corrupt state and
  // collapsed to the floor — safer than propagating and cheaper than
  // refusing to schedule the card.
  const currentEase = clampEase(state.ease);

  let easeAfter: number;
  let intervalDaysAfter: number;

  switch (rating) {
    case "again": {
      easeAfter = clampEase(currentEase - 0.2);
      intervalDaysAfter = 1;
      break;
    }
    case "hard": {
      easeAfter = clampEase(currentEase - 0.15);
      intervalDaysAfter = isNew ? 1 : Math.max(1, state.intervalDays);
      break;
    }
    case "good": {
      easeAfter = currentEase;
      intervalDaysAfter = isNew
        ? 1
        : Math.max(1, Math.round(state.intervalDays * currentEase));
      break;
    }
    case "easy": {
      easeAfter = clampEase(currentEase + 0.15);
      intervalDaysAfter = isNew
        ? 4
        : Math.max(1, Math.round(state.intervalDays * currentEase * 2));
      break;
    }
  }

  const nextDue = new Date(now.getTime() + intervalDaysAfter * DAY_MS);
  return { easeAfter, intervalDaysAfter, nextDue };
}
