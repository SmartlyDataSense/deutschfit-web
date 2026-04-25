"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getServerClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { requireOperator } from "@/lib/auth/requireOperator";

export type RevokeResult = { ok: true; subscriptionId: string } | { ok: false; error: string };

const RevokeInput = z.object({
  user_id: z.string().uuid(),
  subscription_id: z.string().uuid(),
  reason: z.string().trim().min(1, "reason is required"),
});

export async function revokeSubscriptionAction(
  _prev: RevokeResult | undefined,
  formData: FormData
): Promise<RevokeResult> {
  const sb = await getServerClient();
  const { userId: actorId } = await requireOperator(sb);

  const parsed = RevokeInput.safeParse({
    user_id: String(formData.get("user_id") ?? ""),
    subscription_id: String(formData.get("subscription_id") ?? ""),
    reason: String(formData.get("reason") ?? ""),
  });
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: first?.message ?? "invalid_input" };
  }

  const svc = getServiceClient();

  const { data: existing, error: fetchErr } = await svc
    .from("subscriptions")
    .select(
      "id, user_id, status, valid_from, valid_until, plan_id, amount_xaf, payment_method, payment_ref, note"
    )
    .eq("id", parsed.data.subscription_id)
    .maybeSingle();
  if (fetchErr || !existing) {
    return { ok: false, error: "subscription_not_found" };
  }
  if (existing.user_id !== parsed.data.user_id) {
    return { ok: false, error: "subscription_user_mismatch" };
  }
  if (existing.status === "revoked") {
    return { ok: false, error: "already_revoked" };
  }

  const nowIso = new Date().toISOString();

  const { data: updated, error: updErr } = await svc
    .from("subscriptions")
    .update({ status: "revoked", valid_until: nowIso })
    .eq("id", parsed.data.subscription_id)
    .select("id, status, valid_until")
    .single();
  if (updErr || !updated) {
    console.error("revokeSubscription update error", updErr);
    return { ok: false, error: updErr?.message ?? "update_failed" };
  }

  await svc.from("subscription_audit").insert({
    subscription_id: existing.id,
    user_id: existing.user_id,
    actor_id: actorId,
    action: "revoke",
    before: {
      status: existing.status,
      valid_until: existing.valid_until,
    },
    after: {
      status: updated.status,
      valid_until: updated.valid_until,
    },
    reason: parsed.data.reason,
  });

  revalidatePath(`/en/admin/users/${parsed.data.user_id}`);
  revalidatePath(`/fr/admin/users/${parsed.data.user_id}`);
  revalidatePath(`/en/admin`);
  revalidatePath(`/fr/admin`);

  return { ok: true, subscriptionId: updated.id };
}
