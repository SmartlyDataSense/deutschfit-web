/**
 * user_objectives read/upsert — web port of
 * `mobile/src/features/settings/services/userObjectives.ts`.
 * PostgREST via the browser client (RLS scopes rows to the user);
 * throws "unauthenticated" without a session (mobile parity).
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
  if (error) throw error;
  if (!data) return null;
  return { motivation: data.motivation ?? null, dailyMinutes: data.daily_minutes ?? null };
}

export async function updateUserObjectives(input: {
  motivation: string;
  schedule: string;
}): Promise<void> {
  const supabase = getBrowserClient();
  const userId = await requireUserId();
  const minutes = Number(input.schedule);
  const { error } = await supabase.from("user_objectives").upsert(
    {
      user_id: userId,
      motivation: input.motivation,
      daily_minutes: Number.isFinite(minutes) ? minutes : null,
    },
    { onConflict: "user_id" }
  );
  if (error) throw error;
}
