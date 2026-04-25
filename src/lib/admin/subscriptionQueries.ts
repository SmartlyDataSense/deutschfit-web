import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/database.types";
import { loadEmailMap } from "./kpiQueries";
import { PAYMENT_METHODS, type PaymentMethod } from "./assignPlanSchema";

type ServiceClient = SupabaseClient<Database>;

function asPaymentMethod(value: string | undefined): PaymentMethod | undefined {
  if (!value) return undefined;
  return (PAYMENT_METHODS as readonly string[]).includes(value)
    ? (value as PaymentMethod)
    : undefined;
}

export type SubscriptionFilter = {
  status?: string;
  payment_method?: string;
  plan?: string;
  q?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize?: number;
};

export type SubscriptionListRow = {
  id: string;
  user_id: string;
  user_email: string | null;
  plan_code: string | null;
  plan_name: string | null;
  status: string;
  payment_method: string;
  payment_ref: string | null;
  amount_xaf: number;
  valid_from: string;
  valid_until: string;
  created_at: string;
  assigned_by: string;
  assigned_by_email: string | null;
};

export type SubscriptionListResult = {
  rows: SubscriptionListRow[];
  total: number;
  page: number;
  pageSize: number;
};

/**
 * List subscriptions filtered by status / method / plan code / created-at
 * window / email substring. Email filtering is post-hoc (PostgREST cannot
 * `ilike` across the auth.users boundary), so when `q` is set we first
 * resolve matching user IDs via the admin API and then filter the SQL by
 * those ids.
 */
export async function listSubscriptions(
  sb: ServiceClient,
  filter: SubscriptionFilter
): Promise<SubscriptionListResult> {
  const pageSize = filter.pageSize ?? 25;
  const page = Math.max(1, filter.page);

  let userIdFilter: string[] | null = null;
  if (filter.q && filter.q.trim() !== "") {
    const { data } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const needle = filter.q.trim().toLowerCase();
    userIdFilter = (data?.users ?? [])
      .filter((u) => (u.email ?? "").toLowerCase().includes(needle) || u.id === needle)
      .map((u) => u.id);
    if (userIdFilter.length === 0) {
      return { rows: [], total: 0, page, pageSize };
    }
  }

  let planIdFilter: string[] | null = null;
  if (filter.plan && filter.plan.trim() !== "") {
    const { data: planRows } = await sb.from("plans").select("id").eq("code", filter.plan.trim());
    planIdFilter = (planRows ?? []).map((row) => row.id);
    if (planIdFilter.length === 0) {
      return { rows: [], total: 0, page, pageSize };
    }
  }

  const offset = (page - 1) * pageSize;
  let query = sb
    .from("subscriptions")
    .select(
      "id, user_id, status, payment_method, payment_ref, amount_xaf, valid_from, valid_until, created_at, assigned_by, plan:plan_id ( code, name )",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (filter.status) query = query.eq("status", filter.status);
  const methodFilter = asPaymentMethod(filter.payment_method);
  if (methodFilter) query = query.eq("payment_method", methodFilter);
  if (planIdFilter) query = query.in("plan_id", planIdFilter);
  if (userIdFilter) query = query.in("user_id", userIdFilter);
  if (filter.from) query = query.gte("created_at", filter.from);
  if (filter.to) query = query.lte("created_at", filter.to);

  const { data, count, error } = await query;
  if (error) {
    console.error("listSubscriptions error", error);
    return { rows: [], total: 0, page, pageSize };
  }

  const userIds = new Set<string>();
  const actorIds = new Set<string>();
  for (const row of data ?? []) {
    userIds.add(row.user_id);
    actorIds.add(row.assigned_by);
  }
  const emailMap = await loadEmailMap(sb, Array.from(new Set([...userIds, ...actorIds])));

  type PlanShape = { code: string; name: string };
  const rows: SubscriptionListRow[] = (data ?? []).map((row) => {
    const plan = row.plan as PlanShape | PlanShape[] | null;
    const planRecord = Array.isArray(plan) ? (plan[0] ?? null) : plan;
    return {
      id: row.id,
      user_id: row.user_id,
      user_email: emailMap.get(row.user_id) ?? null,
      plan_code: planRecord?.code ?? null,
      plan_name: planRecord?.name ?? null,
      status: row.status,
      payment_method: row.payment_method,
      payment_ref: row.payment_ref,
      amount_xaf: row.amount_xaf,
      valid_from: row.valid_from,
      valid_until: row.valid_until,
      created_at: row.created_at,
      assigned_by: row.assigned_by,
      assigned_by_email: emailMap.get(row.assigned_by) ?? null,
    };
  });

  return { rows, total: count ?? rows.length, page, pageSize };
}
