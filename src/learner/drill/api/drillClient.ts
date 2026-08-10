/**
 * Adaptive drill API client (System A — S9 · Task 9.6).
 *
 * Web port of `deutschfit-mobile/src/features/drill/api/drillClient.ts`
 * onto `invokeFn` (`@/learner/core/api`) instead of
 * `supabase.functions.invoke`. Thin wrapper around the two
 * `deutschfit-backend` edge functions that power the drill feature:
 *
 *   - `drill-recommend` — returns a recommendation (items + enumerated
 *     `reason`) for one of four surfaces: home_daily, post_grade,
 *     suggestions, redo.
 *   - `drill-attempt` — logs an MCQ answer; server computes is_correct
 *     and fans out to BKT mastery update.
 *
 * `invokeFn` throws `ApiError` on transport/HTTP failure (unlike
 * mobile's `{ data, error }` return shape) — both calls sit in a
 * try/catch so every failure (thrown or otherwise) collapses to the
 * same blanket-error envelope mobile returns, letting callers route to
 * a single empty-state branch without their own try/catch.
 */
import { invokeFn } from "@/learner/core/api";

export type DrillSurface = "home_daily" | "post_grade" | "suggestions" | "redo";

export type DrillReason =
  | "ok"
  | "level_not_supported_yet"
  | "no_missing_structures"
  | "no_gaps_yet"
  | "review_mode"
  | "error";

export interface DrillItem {
  readonly id: string;
  readonly concept_code: string;
  readonly before_de: string;
  readonly after_de: string;
  readonly answer_de: string;
  readonly distractors_de: readonly string[];
  readonly explanation_fr: string;
}

export interface DrillRecommendation {
  readonly items: readonly DrillItem[];
  readonly reason: DrillReason;
}

export interface DrillAttemptResult {
  readonly ok: boolean;
  readonly is_correct: boolean;
  readonly correct_answer?: string;
}

export async function fetchDrillRecommendation(input: {
  surface: DrillSurface;
  max_items: number;
  submission_id?: string;
}): Promise<DrillRecommendation> {
  try {
    return await invokeFn<DrillRecommendation>("drill-recommend", { body: input });
  } catch {
    return { items: [], reason: "error" };
  }
}

export async function submitDrillAttempt(input: {
  drill_item_id: string;
  surface: DrillSurface;
  selected: string;
}): Promise<DrillAttemptResult> {
  try {
    return await invokeFn<DrillAttemptResult>("drill-attempt", { body: input });
  } catch {
    return { ok: false, is_correct: false };
  }
}
