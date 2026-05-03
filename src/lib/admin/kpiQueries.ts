import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/database.types";

type ServiceClient = SupabaseClient<Database>;

/**
 * Result row for the recent-activity feed. Joined post-hoc against plans
 * (for the plan code) and `auth.users` (for the target email + actor email)
 * because PostgREST refuses cross-schema embeds. Two extra round-trips beat
 * adding a SECURITY DEFINER view for v1.
 */
export type RecentActivityRow = {
  id: string;
  action: string;
  created_at: string;
  reason: string | null;
  target_user_id: string;
  target_email: string | null;
  actor_id: string;
  actor_email: string | null;
  plan_code: string | null;
};

export type ActiveByPlanRow = {
  plan_id: string;
  plan_code: string;
  plan_name: string;
  count: number;
};

/** Active subscriptions = status='active' AND valid_until > now. */
export async function getActiveSubscribers(sb: ServiceClient): Promise<number> {
  const nowIso = new Date().toISOString();
  const { count } = await sb
    .from("subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("status", "active")
    .gt("valid_until", nowIso);
  return count ?? 0;
}

/**
 * Group active subs by plan. PostgREST has no `group by`, so we fetch the
 * minimal columns and roll up in JS — the cardinality is bounded by the
 * total number of active subs, which is tiny in v1.
 */
export async function getActiveByPlan(sb: ServiceClient): Promise<ActiveByPlanRow[]> {
  const nowIso = new Date().toISOString();
  const { data, error } = await sb
    .from("subscriptions")
    .select("plan_id, plans:plan_id ( id, code, name )")
    .eq("status", "active")
    .gt("valid_until", nowIso);
  if (error || !data) return [];

  const buckets = new Map<string, ActiveByPlanRow>();
  for (const row of data) {
    type PlanShape = { id: string; code: string; name: string };
    const plan = row.plans as PlanShape | PlanShape[] | null;
    const planRecord = Array.isArray(plan) ? (plan[0] ?? null) : plan;
    if (!planRecord) continue;
    const existing = buckets.get(planRecord.id);
    if (existing) {
      existing.count += 1;
    } else {
      buckets.set(planRecord.id, {
        plan_id: planRecord.id,
        plan_code: planRecord.code,
        plan_name: planRecord.name,
        count: 1,
      });
    }
  }
  return Array.from(buckets.values()).sort((a, b) => b.count - a.count);
}

/**
 * MRR proxy in XAF — sums `amount_xaf` across active subs whose plan is a
 * monthly grant (`duration_days <= 31`). Annual subs are excluded so the
 * tile doesn't double-count their cash up-front against the monthly view;
 * a separate "annual contracts" tile could split them later if needed.
 */
export async function getMrrXaf(sb: ServiceClient): Promise<number> {
  const nowIso = new Date().toISOString();
  const { data, error } = await sb
    .from("subscriptions")
    .select("amount_xaf, plans:plan_id ( duration_days )")
    .eq("status", "active")
    .gt("valid_until", nowIso);
  if (error || !data) return 0;

  let mrr = 0;
  for (const row of data) {
    type PlanShape = { duration_days: number };
    const plan = row.plans as PlanShape | PlanShape[] | null;
    const planRecord = Array.isArray(plan) ? (plan[0] ?? null) : plan;
    if (!planRecord) continue;
    if (planRecord.duration_days <= 31) {
      mrr += row.amount_xaf ?? 0;
    }
  }
  return mrr;
}

/**
 * Trial usage snapshot. The `trial_usage` table has no per-month column —
 * it's a lifetime counter — so this returns the current totals broken down
 * by trial-kind. The dashboard label is "Trial usage (lifetime)" to avoid
 * misreading.
 */
export async function getTrialUsageThisMonth(
  sb: ServiceClient
): Promise<{ kind: string; total: number }[]> {
  const { data, error } = await sb.from("trial_usage").select("kind, count");
  if (error || !data) return [];
  const totals = new Map<string, number>();
  for (const row of data) {
    totals.set(row.kind, (totals.get(row.kind) ?? 0) + (row.count ?? 0));
  }
  return Array.from(totals.entries())
    .map(([kind, total]) => ({ kind, total }))
    .sort((a, b) => b.total - a.total);
}

/**
 * Last N audit rows joined to the actor email, target email, and plan code.
 * Three reads — one to PostgREST for the audit rows + plan join, plus two
 * `auth.admin.listUsers`-style cross-references via `users` table. We use
 * the service client throughout, which can read `auth.users` directly.
 */
export async function getRecentActivity(
  sb: ServiceClient,
  limit = 20
): Promise<RecentActivityRow[]> {
  const { data, error } = await sb
    .from("subscription_audit")
    .select(
      "id, action, created_at, reason, user_id, actor_id, after, subscription:subscription_id ( plan_id, plans:plan_id ( code ) )"
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];

  const userIds = new Set<string>();
  for (const row of data) {
    if (row.user_id) userIds.add(row.user_id);
    if (row.actor_id) userIds.add(row.actor_id);
  }
  const emailMap = await loadEmailMap(sb, Array.from(userIds));

  type SubShape = { plan_id: string | null; plans: { code: string } | { code: string }[] | null };

  return data.map((row) => {
    const sub = row.subscription as SubShape | SubShape[] | null;
    const subRecord = Array.isArray(sub) ? (sub[0] ?? null) : sub;
    const plan = subRecord?.plans;
    const planRecord = Array.isArray(plan) ? (plan[0] ?? null) : (plan ?? null);
    return {
      id: row.id,
      action: row.action,
      created_at: row.created_at,
      reason: row.reason,
      target_user_id: row.user_id,
      target_email: emailMap.get(row.user_id) ?? null,
      actor_id: row.actor_id,
      actor_email: emailMap.get(row.actor_id) ?? null,
      plan_code: planRecord?.code ?? null,
    };
  });
}

/**
 * Look up email addresses for a set of user ids by hitting the admin API.
 * Service-role only — anon clients can't list users.
 */
export async function loadEmailMap(
  sb: ServiceClient,
  userIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (userIds.length === 0) return map;
  // Page through users; v1 user counts are tiny (operator-curated), so a
  // single 1000-row page is plenty.
  const { data } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (!data?.users) return map;
  const wanted = new Set(userIds);
  for (const user of data.users) {
    if (wanted.has(user.id) && user.email) {
      map.set(user.id, user.email);
    }
  }
  return map;
}
