import { getBrowserClient } from "@/lib/supabase/browser";

export async function readOnboardedAt(userId: string): Promise<string | null> {
  const { data, error } = await getBrowserClient()
    .from("user_profiles").select("onboarded_at").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message || "onboarded_at_lookup_failed");
  const stamped = data?.onboarded_at;
  return typeof stamped === "string" && stamped.length > 0 ? stamped : null;
}

export async function hasDiagnosticOnServer(userId: string): Promise<boolean> {
  const { data, error } = await getBrowserClient()
    .from("user_diagnostic_answers").select("user_id").eq("user_id", userId)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message || "diagnostic_resume_lookup_failed");
  return data !== null;
}
