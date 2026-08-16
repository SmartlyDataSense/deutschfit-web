/**
 * `useSubmitReview` — persist a self-rating for an SRS card.
 *
 * Contract:
 *   1. Compute the next state via the SM-2 scheduler (`@/learner/core/srs/sm2`),
 *      seeding the current ease + interval from the latest review row
 *      for this card (falling back to a fresh-card state).
 *   2. Insert the rating into `srsReviews`.
 *   3. Update `srsCards.next_due` so `useDueCards` stops returning
 *      this card until the new deadline.
 *
 * Exposed as a pure `submitReview()` helper (for tests + coach drill
 * chain reuse) and a thin `useSubmitReview()` hook that tracks a
 * `submitting` flag for button disabled-state binding.
 *
 * Port of mobile `src/features/srs/hooks/useSubmitReview.ts` (Drizzle ->
 * LearnerTableApi). S10-D4: `LearnerTableApi` has no `orderBy`/`limit`,
 * so "latest prior review" is `whereEquals("user_id", userId)` -> JS
 * filter on `card_id` -> sort descending on `reviewed_at` -> take `[0]`.
 *
 * web#44 (S14 gate): `srsCards`/`srsReviews` moved to a `(user_id, id)`
 * composite primary key (schema v2) for per-account isolation. Every read
 * and write here now carries `userId` — the prior-review lookup is scoped
 * by `user_id` (not just `card_id`) so two accounts on the same browser
 * can never seed one another's SM-2 state, and `srsCards.get`/`.put` use
 * the compound `[userId, cardId]` key.
 */
import { useCallback, useRef, useState } from "react";

import { getLearnerDb } from "@/learner/core/db";
import type { SRSRating, SRSReviewRow } from "@/learner/core/db/types";
import { useLearnerSession } from "@/learner/core/auth/useLearnerSession";
import { schedule, SM2_DEFAULT_EASE } from "@/learner/core/srs/sm2";

import type { DifficultyRating, SRSReview } from "../types";
import { DIFFICULTY_TO_RATING } from "../types";

/** Minimal v4-style id generator — avoids pulling in `uuid` as a dep. */
export function generateReviewId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `rev_${Date.now().toString(36)}_${rand}`;
}

export interface SubmitReviewInput {
  readonly cardId: string;
  /** Scopes the read/write to this account's cards/reviews (web#44). */
  readonly userId: string;
  readonly rating: DifficultyRating | SRSRating;
  /** Injectable clock for deterministic tests. */
  readonly now?: Date;
  /** Override the review-row id (tests, idempotent replays). */
  readonly reviewId?: string;
}

function toRating(value: DifficultyRating | SRSRating): SRSRating {
  if (value === "again" || value === "hard" || value === "good" || value === "easy") {
    return DIFFICULTY_TO_RATING[value];
  }
  // Exhaustive — keeps TS happy if SRSRating ever diverges.
  return value;
}

export async function submitReview(input: SubmitReviewInput): Promise<SRSReview> {
  const rating = toRating(input.rating);
  const now = input.now ?? new Date();

  const db = await getLearnerDb();

  // Seed SM-2 state from the latest review row for this card, if any.
  // Scoped by `user_id` first (not `card_id` alone) so a different
  // account's review history for a same-shaped card id can never seed
  // this account's schedule (web#44) — same whereEquals-then-JS-filter
  // idiom as `core/storage/practiceProgress.ts`.
  const priorReviews = (
    (await db.srsReviews.whereEquals("user_id", input.userId)) as unknown as SRSReviewRow[]
  ).filter((r) => r.card_id === input.cardId);
  const latest = [...priorReviews].sort((a, b) => b.reviewed_at - a.reviewed_at)[0];
  const seed = latest
    ? { ease: latest.ease_after, intervalDays: latest.interval_days_after }
    : { ease: SM2_DEFAULT_EASE, intervalDays: 0 };

  const result = schedule(seed, rating, now);

  const reviewId = input.reviewId ?? generateReviewId();
  const row: SRSReviewRow = {
    id: reviewId,
    user_id: input.userId,
    card_id: input.cardId,
    reviewed_at: now.getTime(),
    rating,
    ease_after: result.easeAfter,
    interval_days_after: result.intervalDaysAfter,
    next_due: result.nextDue.getTime(),
  };

  await db.srsReviews.put(row as never);

  // Keep the card's cached next-due in sync so `useDueCards` stops
  // returning it. Compound-PK `get`/`put` take the `[user_id, id]` key.
  const card = await db.srsCards.get([input.userId, input.cardId]);
  if (card) {
    await db.srsCards.put({ ...card, next_due: row.next_due } as never);
  }

  return {
    id: reviewId,
    cardId: input.cardId,
    reviewedAt: now,
    rating,
    easeAfter: result.easeAfter,
    intervalDaysAfter: result.intervalDaysAfter,
    nextDue: result.nextDue,
  };
}

/** Hook-facing input — `userId` is sourced from `useLearnerSession`, not the caller. */
export type UseSubmitReviewInput = Omit<SubmitReviewInput, "userId">;

export interface UseSubmitReviewResult {
  readonly submitting: boolean;
  readonly error: Error | null;
  readonly submit: (input: UseSubmitReviewInput) => Promise<SRSReview>;
}

export function useSubmitReview(): UseSubmitReviewResult {
  const userId = useLearnerSession((s) => s.session?.user?.id ?? null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const inflight = useRef<Promise<SRSReview> | null>(null);

  const submit = useCallback(
    async (input: UseSubmitReviewInput): Promise<SRSReview> => {
      if (inflight.current) {
        return inflight.current;
      }
      setSubmitting(true);
      setError(null);
      const promise = (
        userId
          ? submitReview({ ...input, userId })
          : Promise.reject(new Error("useSubmitReview: no authenticated user"))
      )
        .catch((err: unknown) => {
          const wrapped = err instanceof Error ? err : new Error(String(err));
          setError(wrapped);
          throw wrapped;
        })
        .finally(() => {
          inflight.current = null;
          setSubmitting(false);
        });
      inflight.current = promise;
      return promise;
    },
    [userId]
  );

  return { submitting, error, submit };
}
