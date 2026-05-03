import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/database.types";
import { loadEmailMap } from "./kpiQueries";

type ServiceClient = SupabaseClient<Database>;

export type AuditFilter = {
  actor?: string;
  action?: string;
  q?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize?: number;
};

export type AuditListRow = {
  id: string;
  action: string;
  reason: string | null;
  created_at: string;
  user_id: string;
  user_email: string | null;
  actor_id: string;
  actor_email: string | null;
  subscription_id: string | null;
};

export type AuditListResult = {
  rows: AuditListRow[];
  total: number;
  page: number;
  pageSize: number;
};

/**
 * Paginate `subscription_audit` with optional filters. The `actor` and `q`
 * (target email) filters resolve email-substring matches against
 * `auth.users` first, then push `in()` clauses through PostgREST. When the
 * email filter resolves to zero ids we short-circuit with an empty page.
 */
export async function listAudit(sb: ServiceClient, filter: AuditFilter): Promise<AuditListResult> {
  const pageSize = filter.pageSize ?? 50;
  const page = Math.max(1, filter.page);

  const { data: usersData } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const allUsers = usersData?.users ?? [];

  const matchEmail = (needle: string | undefined) => {
    if (!needle) return null;
    const lower = needle.trim().toLowerCase();
    if (!lower) return null;
    return allUsers
      .filter((u) => (u.email ?? "").toLowerCase().includes(lower) || u.id === lower)
      .map((u) => u.id);
  };

  const actorIds = matchEmail(filter.actor);
  const targetIds = matchEmail(filter.q);
  if ((actorIds && actorIds.length === 0) || (targetIds && targetIds.length === 0)) {
    return { rows: [], total: 0, page, pageSize };
  }

  const offset = (page - 1) * pageSize;
  let query = sb
    .from("subscription_audit")
    .select("id, action, reason, created_at, user_id, actor_id, subscription_id", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (filter.action) query = query.eq("action", filter.action);
  if (actorIds) query = query.in("actor_id", actorIds);
  if (targetIds) query = query.in("user_id", targetIds);
  if (filter.from) query = query.gte("created_at", filter.from);
  if (filter.to) query = query.lte("created_at", filter.to);

  const { data, count, error } = await query;
  if (error) {
    console.error("listAudit error", error);
    return { rows: [], total: 0, page, pageSize };
  }

  const ids = new Set<string>();
  for (const row of data ?? []) {
    ids.add(row.user_id);
    ids.add(row.actor_id);
  }
  const emailMap = await loadEmailMap(sb, Array.from(ids));

  const rows: AuditListRow[] = (data ?? []).map((row) => ({
    id: row.id,
    action: row.action,
    reason: row.reason,
    created_at: row.created_at,
    user_id: row.user_id,
    user_email: emailMap.get(row.user_id) ?? null,
    actor_id: row.actor_id,
    actor_email: emailMap.get(row.actor_id) ?? null,
    subscription_id: row.subscription_id,
  }));

  return { rows, total: count ?? rows.length, page, pageSize };
}
