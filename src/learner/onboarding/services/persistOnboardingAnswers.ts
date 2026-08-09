/**
 * Persist onboarding answers to Supabase (PR-C).
 *
 * Called from `useFinishOnboarding` right before the per-user
 * `@deutschfit/onboarding-done` flag flips. Two responsibilities:
 *
 *   1. Upsert the user's `user_objectives` row (motivation + daily_minutes).
 *      Conflict target: `user_id`. Schedule comes in as a string enum
 *      ("5"|"10"|"20"|"30"|"45"|"60") and is cast to `number | null`.
 *   2. Stamp `user_profiles.onboarded_at = now()` *only* if it is currently
 *      null — guards against multi-device replays where a different client
 *      already onboarded this account. We use `.is("onboarded_at", null)`
 *      as a race-safe filter; concurrent stamps from two devices land on
 *      the same `now()` value at worst, never a double-write.
 *
 * The function does not throw on the server-write half. The caller treats
 * `{ ok: false, reason }` as a soft warning (`console.warn` on web — no
 * toast system in S2, see `useFinishOnboarding`), then still lets the local
 * flag flip so the user sees a useful screen — server-gate re-prompts
 * onboarding next session if persist truly failed.
 *
 * Web port of `deutschfit-mobile/src/features/onboarding/services/
 * persistOnboardingAnswers.ts`: `supabase` → `getBrowserClient()` (called
 * inside the function, not at module scope) and `useAuth` → `useLearnerSession`.
 */
import { getBrowserClient } from "@/lib/supabase/browser";
import { useLearnerSession } from "@/learner/core/auth/useLearnerSession";

import type { OnboardingMotivation, OnboardingSchedule } from "../state/useOnboardingAnswers";

export type PersistOnboardingAnswersInput = {
  motivation: OnboardingMotivation | null;
  schedule: OnboardingSchedule | null;
};

export type PersistOnboardingAnswersResult =
  | { ok: true; stampedOnboardedAt: boolean }
  | { ok: false; reason: string };

export async function persistOnboardingAnswers(
  input: PersistOnboardingAnswersInput
): Promise<PersistOnboardingAnswersResult> {
  const userId = useLearnerSession.getState().session?.user.id;
  if (!userId) return { ok: false, reason: "unauthenticated" };

  const dailyMinutes = input.schedule != null ? Number(input.schedule) : null;

  const supabase = getBrowserClient();

  const { error: objectivesError } = await supabase.from("user_objectives").upsert(
    {
      user_id: userId,
      motivation: input.motivation,
      daily_minutes: dailyMinutes,
    },
    { onConflict: "user_id" }
  );
  if (objectivesError) {
    return {
      ok: false,
      reason: objectivesError.message || "upsert_user_objectives_failed",
    };
  }

  const { data: existing, error: readError } = await supabase
    .from("user_profiles")
    .select("onboarded_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (readError) {
    return {
      ok: false,
      reason: readError.message || "read_user_profile_failed",
    };
  }
  if (existing?.onboarded_at != null) {
    return { ok: true, stampedOnboardedAt: false };
  }

  const { error: stampError } = await supabase
    .from("user_profiles")
    .update({ onboarded_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("onboarded_at", null);
  if (stampError) {
    return {
      ok: false,
      reason: stampError.message || "stamp_onboarded_at_failed",
    };
  }

  return { ok: true, stampedOnboardedAt: true };
}
