/**
 * user_objectives read/upsert — web port of
 * `mobile/src/features/settings/services/userObjectives.ts`.
 * PostgREST via the browser client (RLS scopes rows to the user);
 * throws "unauthenticated" without a session (mobile parity). PostgREST
 * errors are wrapped with mobile's exact fallback strings
 * (userObjectives.ts:39,71) rather than re-thrown raw, so a caller
 * pattern-matching on `err.message` sees the same codes on both
 * platforms.
 */
import { getBrowserClient } from "@/lib/supabase/browser";

export interface UserObjectivesRead {
  motivation: string | null;
  dailyMinutes: number | null;
}

async function requireUserId(): Promise<string> {
  const supabase = getBrowserClient();
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) throw new Error("unauthenticated");
  return userId;
}

export async function readUserObjectives(): Promise<UserObjectivesRead | null> {
  const supabase = getBrowserClient();
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("user_objectives")
    .select("motivation, daily_minutes")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message || "read_user_objectives_failed");
  if (!data) return null;
  return { motivation: data.motivation ?? null, dailyMinutes: data.daily_minutes ?? null };
}

export async function updateUserObjectives(input: {
  motivation: string | null;
  schedule: string | null;
}): Promise<void> {
  const supabase = getBrowserClient();
  const userId = await requireUserId();
  // Mobile parity (userObjectives.ts:60) — a null schedule (no bucket
  // selected / row never written) passes straight through as
  // `daily_minutes: null` rather than being coerced into a bucket. The
  // `Number.isFinite` guard below additionally covers a non-numeric
  // *non-null* string (this service's input type is `string`, wider than
  // mobile's `OnboardingSchedule` literal union, so that case can occur
  // here but not there).
  const minutes = input.schedule != null ? Number(input.schedule) : null;
  const dailyMinutes = minutes != null && Number.isFinite(minutes) ? minutes : null;
  const { error } = await supabase.from("user_objectives").upsert(
    {
      user_id: userId,
      motivation: input.motivation,
      daily_minutes: dailyMinutes,
    },
    { onConflict: "user_id" }
  );
  if (error) throw new Error(error.message || "update_user_objectives_failed");
}
