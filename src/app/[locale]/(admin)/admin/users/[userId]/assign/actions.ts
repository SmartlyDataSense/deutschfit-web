"use server";

import { revalidatePath } from "next/cache";
import { getServerClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { requireOperator } from "@/lib/auth/requireOperator";
import { AssignPlanInput } from "@/lib/admin/assignPlanSchema";
import {
  EmailNotConfiguredError,
  sendActivationEmail,
  type SupportedEmailLocale,
} from "@/lib/email/send-activation-email";

export type AssignPlanResult =
  | { ok: true; subscriptionId: string; emailWarning?: string }
  | { ok: false; error: string };

const SUPPORTED_LOCALES: SupportedEmailLocale[] = ["de", "en", "fr"];

function normalizeLocale(value: string): SupportedEmailLocale {
  return SUPPORTED_LOCALES.includes(value as SupportedEmailLocale)
    ? (value as SupportedEmailLocale)
    : "en";
}

function readDateTime(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  // <input type="datetime-local"> emits "YYYY-MM-DDTHH:mm" without a TZ.
  // We treat the value as UTC for simplicity (operator surface, not a
  // public form). If a TZ is already present, leave it.
  if (value.includes("Z") || /[+-]\d{2}:\d{2}$/.test(value)) return value;
  return `${value}:00Z`.replace(/(\d{2}:\d{2}):00Z$/, "$1:00Z");
}

export async function assignPlanAction(
  _prev: AssignPlanResult | undefined,
  formData: FormData
): Promise<AssignPlanResult> {
  const sb = await getServerClient();
  const { userId: actorId } = await requireOperator(sb);

  const payload = {
    user_id: String(formData.get("user_id") ?? ""),
    plan_id: String(formData.get("plan_id") ?? ""),
    payment_method: String(formData.get("payment_method") ?? ""),
    payment_ref: ((formData.get("payment_ref") as string | null) ?? "").trim() || undefined,
    valid_from: readDateTime(formData.get("valid_from")) ?? "",
    valid_until: readDateTime(formData.get("valid_until")),
    note: ((formData.get("note") as string | null) ?? "").trim() || undefined,
    reason: ((formData.get("reason") as string | null) ?? "").trim() || undefined,
  };

  const parsed = AssignPlanInput.safeParse(payload);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const path = first?.path?.[0];
    return {
      ok: false,
      error: path
        ? `${String(path)}: ${first?.message ?? "invalid"}`
        : (first?.message ?? "invalid"),
    };
  }

  const svc = getServiceClient();

  const { data: plan, error: planErr } = await svc
    .from("plans")
    .select("id, code, name, price_xaf, duration_days")
    .eq("id", parsed.data.plan_id)
    .maybeSingle();
  if (planErr || !plan) return { ok: false, error: "plan_not_found" };

  const validFrom = new Date(parsed.data.valid_from);
  const validUntil = parsed.data.valid_until
    ? new Date(parsed.data.valid_until)
    : new Date(validFrom.getTime() + plan.duration_days * 86_400_000);

  const { data: sub, error: insErr } = await svc
    .from("subscriptions")
    .insert({
      user_id: parsed.data.user_id,
      plan_id: plan.id,
      payment_method: parsed.data.payment_method,
      payment_ref: parsed.data.payment_ref ?? null,
      amount_xaf: plan.price_xaf,
      valid_from: validFrom.toISOString(),
      valid_until: validUntil.toISOString(),
      status: "active",
      note: parsed.data.note ?? null,
      assigned_by: actorId,
    })
    .select("id")
    .single();
  if (insErr || !sub) {
    console.error("assignPlan insert error", insErr);
    return { ok: false, error: insErr?.message ?? "insert_failed" };
  }

  await svc.from("subscription_audit").insert({
    subscription_id: sub.id,
    user_id: parsed.data.user_id,
    actor_id: actorId,
    action: "assign",
    before: null,
    after: {
      subscription_id: sub.id,
      plan_id: plan.id,
      plan_code: plan.code,
      payment_method: parsed.data.payment_method,
      payment_ref: parsed.data.payment_ref ?? null,
      amount_xaf: plan.price_xaf,
      valid_from: validFrom.toISOString(),
      valid_until: validUntil.toISOString(),
      note: parsed.data.note ?? null,
    },
    reason: parsed.data.reason ?? null,
  });

  let emailWarning: string | undefined;
  const userRes = await svc.auth.admin.getUserById(parsed.data.user_id);
  const targetEmail = userRes.data?.user?.email ?? null;
  const localeRaw = userRes.data?.user?.user_metadata?.preferred_language ?? "en";
  if (targetEmail) {
    try {
      await sendActivationEmail({
        to: targetEmail,
        planName: plan.name,
        validFrom,
        validUntil,
        locale: normalizeLocale(typeof localeRaw === "string" ? localeRaw : "en"),
      });
    } catch (err) {
      if (err instanceof EmailNotConfiguredError) {
        emailWarning = "Subscription saved, but RESEND_API_KEY is not configured — no email sent.";
      } else {
        console.error("assignPlan email error", err);
        emailWarning = "Subscription saved, but the activation email failed to send.";
      }
    }
  } else {
    emailWarning = "Subscription saved, but no email is associated with this user.";
  }

  revalidatePath(`/en/admin/users/${parsed.data.user_id}`);
  revalidatePath(`/fr/admin/users/${parsed.data.user_id}`);
  revalidatePath(`/en/admin`);
  revalidatePath(`/fr/admin`);

  return { ok: true, subscriptionId: sub.id, emailWarning };
}
