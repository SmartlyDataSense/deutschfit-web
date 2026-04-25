import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/database.types";
import { loadEmailMap } from "./kpiQueries";

type ServiceClient = SupabaseClient<Database>;

export type AdminUserRow = {
  user_id: string;
  email: string | null;
  is_operator: boolean;
  created_at: string | null;
  current_tier: string | null;
  current_valid_until: string | null;
};

export type UserSearchResult = {
  rows: AdminUserRow[];
  total: number;
  page: number;
  pageSize: number;
};

/**
 * Search users by email substring (case-insensitive) using the admin API
 * to enumerate `auth.users`, then enrich with `entitlements` for the
 * current tier. v1 expects a small user count; if it grows past one page
 * (perPage=1000) we'll switch to a SECURITY DEFINER RPC.
 */
export async function searchUsers(
  sb: ServiceClient,
  options: { q: string; page: number; pageSize?: number }
): Promise<UserSearchResult> {
  const pageSize = options.pageSize ?? 25;
  const page = Math.max(1, options.page);

  const { data, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error || !data) {
    return { rows: [], total: 0, page, pageSize };
  }

  const queryLower = options.q.trim().toLowerCase();
  const filtered = (data.users ?? []).filter((u) => {
    if (!queryLower) return true;
    return (u.email ?? "").toLowerCase().includes(queryLower) || u.id === options.q.trim();
  });

  // Sort newest first by created_at.
  filtered.sort((a, b) => {
    const ta = a.created_at ? Date.parse(a.created_at) : 0;
    const tb = b.created_at ? Date.parse(b.created_at) : 0;
    return tb - ta;
  });

  const total = filtered.length;
  const offset = (page - 1) * pageSize;
  const slice = filtered.slice(offset, offset + pageSize);

  if (slice.length === 0) {
    return { rows: [], total, page, pageSize };
  }

  const ids = slice.map((u) => u.id);

  const [profilesRes, entitlementsRes] = await Promise.all([
    sb.from("user_profiles").select("user_id, is_operator").in("user_id", ids),
    sb.from("entitlements").select("user_id, tier, valid_until").in("user_id", ids),
  ]);

  const profileMap = new Map<string, boolean>();
  for (const row of profilesRes.data ?? []) {
    profileMap.set(row.user_id, !!row.is_operator);
  }
  const entitlementMap = new Map<string, { tier: string | null; valid_until: string | null }>();
  for (const row of entitlementsRes.data ?? []) {
    if (row.user_id) {
      entitlementMap.set(row.user_id, {
        tier: row.tier ?? null,
        valid_until: row.valid_until ?? null,
      });
    }
  }

  const rows: AdminUserRow[] = slice.map((u) => {
    const ent = entitlementMap.get(u.id);
    return {
      user_id: u.id,
      email: u.email ?? null,
      is_operator: profileMap.get(u.id) ?? false,
      created_at: u.created_at ?? null,
      current_tier: ent?.tier ?? null,
      current_valid_until: ent?.valid_until ?? null,
    };
  });

  return { rows, total, page, pageSize };
}

export type UserDetail = {
  user_id: string;
  email: string | null;
  is_operator: boolean;
  created_at: string | null;
  entitlement: { tier: string | null; valid_until: string | null } | null;
  subscriptions: SubscriptionRow[];
  audit: AuditRow[];
  trial_usage: TrialUsageRow[];
};

export type SubscriptionRow = {
  id: string;
  status: string;
  payment_method: string;
  payment_ref: string | null;
  amount_xaf: number;
  valid_from: string;
  valid_until: string;
  created_at: string;
  note: string | null;
  plan_code: string | null;
  plan_name: string | null;
  assigned_by: string;
  assigned_by_email: string | null;
};

export type AuditRow = {
  id: string;
  action: string;
  reason: string | null;
  created_at: string;
  actor_id: string;
  actor_email: string | null;
  subscription_id: string | null;
  before: unknown;
  after: unknown;
};

export type TrialUsageRow = {
  kind: string;
  count: number;
};

/** Load every section the user-detail page needs in parallel. */
export async function loadUserDetail(
  sb: ServiceClient,
  userId: string
): Promise<UserDetail | null> {
  const userRes = await sb.auth.admin.getUserById(userId);
  if (userRes.error || !userRes.data?.user) return null;
  const user = userRes.data.user;

  const [profileRes, entitlementRes, subsRes, auditRes, trialRes] = await Promise.all([
    sb.from("user_profiles").select("is_operator").eq("user_id", userId).maybeSingle(),
    sb.from("entitlements").select("tier, valid_until").eq("user_id", userId).maybeSingle(),
    sb
      .from("subscriptions")
      .select(
        "id, status, payment_method, payment_ref, amount_xaf, valid_from, valid_until, created_at, note, assigned_by, plan:plan_id ( code, name )"
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    sb
      .from("subscription_audit")
      .select("id, action, reason, created_at, actor_id, subscription_id, before, after")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    sb.from("trial_usage").select("kind, count").eq("user_id", userId),
  ]);

  const actorIds = new Set<string>();
  for (const row of auditRes.data ?? []) {
    actorIds.add(row.actor_id);
  }
  for (const row of subsRes.data ?? []) {
    actorIds.add(row.assigned_by);
  }
  const actorEmailMap = await loadEmailMap(sb, Array.from(actorIds));

  type PlanShape = { code: string; name: string };

  const subscriptions: SubscriptionRow[] = (subsRes.data ?? []).map((row) => {
    const plan = row.plan as PlanShape | PlanShape[] | null;
    const planRecord = Array.isArray(plan) ? (plan[0] ?? null) : plan;
    return {
      id: row.id,
      status: row.status,
      payment_method: row.payment_method,
      payment_ref: row.payment_ref,
      amount_xaf: row.amount_xaf,
      valid_from: row.valid_from,
      valid_until: row.valid_until,
      created_at: row.created_at,
      note: row.note,
      plan_code: planRecord?.code ?? null,
      plan_name: planRecord?.name ?? null,
      assigned_by: row.assigned_by,
      assigned_by_email: actorEmailMap.get(row.assigned_by) ?? null,
    };
  });

  const audit: AuditRow[] = (auditRes.data ?? []).map((row) => ({
    id: row.id,
    action: row.action,
    reason: row.reason,
    created_at: row.created_at,
    actor_id: row.actor_id,
    actor_email: actorEmailMap.get(row.actor_id) ?? null,
    subscription_id: row.subscription_id,
    before: row.before,
    after: row.after,
  }));

  const trialUsage: TrialUsageRow[] = (trialRes.data ?? []).map((row) => ({
    kind: row.kind,
    count: row.count,
  }));

  return {
    user_id: userId,
    email: user.email ?? null,
    is_operator: profileRes.data?.is_operator ?? false,
    created_at: user.created_at ?? null,
    entitlement: entitlementRes.data
      ? {
          tier: entitlementRes.data.tier ?? null,
          valid_until: entitlementRes.data.valid_until ?? null,
        }
      : null,
    subscriptions,
    audit,
    trial_usage: trialUsage,
  };
}
