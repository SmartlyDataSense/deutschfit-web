import { setRequestLocale } from "next-intl/server";
import { Box, Text } from "@/components/primitives";
import { Link } from "@/i18n/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { Pagination } from "@/components/admin/Pagination";
import { AuditFilters, type AuditFilterState } from "@/components/admin/AuditFilters";
import { requireOperator } from "@/lib/auth/requireOperator";
import { getServerClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { listAudit } from "@/lib/admin/auditQueries";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function paramValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function rangeIsoBoundary(value: string, kind: "from" | "to"): string | undefined {
  if (!value) return undefined;
  return kind === "from" ? `${value}T00:00:00Z` : `${value}T23:59:59Z`;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toISOString().slice(0, 16).replace("T", " ");
}

export default async function AdminAuditPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const sb = await getServerClient();
  const { email: operatorEmail } = await requireOperator(sb);

  const sp = await searchParams;
  const filterState: AuditFilterState = {
    actor: paramValue(sp.actor),
    action: paramValue(sp.action),
    q: paramValue(sp.q),
    from: paramValue(sp.from),
    to: paramValue(sp.to),
  };
  const page = Math.max(1, Number(paramValue(sp.page) || "1") || 1);

  const svc = getServiceClient();
  const result = await listAudit(svc, {
    actor: filterState.actor || undefined,
    action: filterState.action || undefined,
    q: filterState.q || undefined,
    from: rangeIsoBoundary(filterState.from, "from"),
    to: rangeIsoBoundary(filterState.to, "to"),
    page,
  });

  const buildHref = (target: number) => {
    const params = new URLSearchParams();
    if (filterState.actor) params.set("actor", filterState.actor);
    if (filterState.action) params.set("action", filterState.action);
    if (filterState.q) params.set("q", filterState.q);
    if (filterState.from) params.set("from", filterState.from);
    if (filterState.to) params.set("to", filterState.to);
    if (target > 1) params.set("page", String(target));
    const qs = params.toString();
    return qs ? `/${locale}/admin/audit?${qs}` : `/${locale}/admin/audit`;
  };

  return (
    <AdminShell operatorEmail={operatorEmail}>
      <Box className="mb-6">
        <Text variant="h1" as="h1" className="text-text-primary">
          Audit log
        </Text>
        <Text variant="body" className="mt-1 text-text-secondary">
          Every operator action that touched a subscription or trial counter.
        </Text>
      </Box>

      <Box className="mb-6">
        <AuditFilters pathname={`/${locale}/admin/audit`} state={filterState} />
      </Box>

      <Box className="overflow-hidden rounded-lg border border-line-soft bg-bg-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-cream-deep text-xs uppercase tracking-wide text-text-tertiary">
            <tr>
              <th className="px-4 py-3 font-semibold">When</th>
              <th className="px-4 py-3 font-semibold">Action</th>
              <th className="px-4 py-3 font-semibold">Actor</th>
              <th className="px-4 py-3 font-semibold">Target</th>
              <th className="px-4 py-3 font-semibold">Reason</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-text-tertiary">
                  No audit rows match those filters.
                </td>
              </tr>
            ) : (
              result.rows.map((row) => (
                <tr key={row.id} className="border-t border-line-soft align-top">
                  <td className="px-4 py-3 font-mono text-xs text-text-secondary">
                    {formatDateTime(row.created_at)}
                  </td>
                  <td className="px-4 py-3 text-text-primary">{row.action}</td>
                  <td className="px-4 py-3 text-text-secondary">
                    {row.actor_email ?? row.actor_id.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    <Link
                      href={`/admin/users/${row.user_id}`}
                      className="underline underline-offset-2"
                    >
                      {row.user_email ?? row.user_id}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{row.reason ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Box>

      <Pagination
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        buildHref={buildHref}
      />
    </AdminShell>
  );
}
