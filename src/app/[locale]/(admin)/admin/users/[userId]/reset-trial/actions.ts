"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getServerClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { requireOperator } from "@/lib/auth/requireOperator";

export type ResetTrialResult = { ok: true; deletedKinds: string[] } | { ok: false; error: string };

const ResetTrialInput = z.object({
  user_id: z.string().uuid(),
  reason: z
    .string()
    .trim()
    .min(1)
    .optional()
    .transform((value) => value ?? "trial reset by operator"),
});

export async function resetTrialAction(
  _prev: ResetTrialResult | undefined,
  formData: FormData
): Promise<ResetTrialResult> {
  const sb = await getServerClient();
  const { userId: actorId } = await requireOperator(sb);

  const parsed = ResetTrialInput.safeParse({
    user_id: String(formData.get("user_id") ?? ""),
    reason: ((formData.get("reason") as string | null) ?? "").trim() || undefined,
  });
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: first?.message ?? "invalid_input" };
  }

  const svc = getServiceClient();

  const { data: rows, error: fetchErr } = await svc
    .from("trial_usage")
    .select("kind, count")
    .eq("user_id", parsed.data.user_id);
  if (fetchErr) {
    console.error("resetTrial fetch error", fetchErr);
    return { ok: false, error: fetchErr.message };
  }

  const kinds = (rows ?? []).map((row) => row.kind);

  const { error: delErr } = await svc
    .from("trial_usage")
    .delete()
    .eq("user_id", parsed.data.user_id);
  if (delErr) {
    console.error("resetTrial delete error", delErr);
    return { ok: false, error: delErr.message };
  }

  await svc.from("subscription_audit").insert({
    subscription_id: null,
    user_id: parsed.data.user_id,
    actor_id: actorId,
    action: "note_update",
    before: { trial_usage: rows ?? [] },
    after: { trial_usage: [] },
    reason: parsed.data.reason,
  });

  revalidatePath(`/en/admin/users/${parsed.data.user_id}`);
  revalidatePath(`/fr/admin/users/${parsed.data.user_id}`);

  return { ok: true, deletedKinds: kinds };
}
