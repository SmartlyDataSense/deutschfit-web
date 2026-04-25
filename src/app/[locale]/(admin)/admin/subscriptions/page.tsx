import { setRequestLocale } from "next-intl/server";
import { Box, Text, Badge } from "@/components/primitives";
import { Link } from "@/i18n/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { Pagination } from "@/components/admin/Pagination";
import {
  SubscriptionFilters,
  type SubscriptionFilterState,
} from "@/components/admin/SubscriptionFilters";
import { requireOperator } from "@/lib/auth/requireOperator";
import { getServerClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { listSubscriptions } from "@/lib/admin/subscriptionQueries";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const xafFormatter = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "XAF",
  maximumFractionDigits: 0,
});

function paramValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toISOString().slice(0, 10);
}

function rangeIsoBoundary(value: string, kind: "from" | "to"): string | undefined {
  if (!value) return undefined;
  return kind === "from" ? `${value}T00:00:00Z` : `${value}T23:59:59Z`;
}

export default async function AdminSubscriptionsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const sb = await getServerClient();
  const { email: operatorEmail } = await requireOperator(sb);

  const sp = await searchParams;
  const filterState: SubscriptionFilterState = {
    status: paramValue(sp.status),
    payment_method: paramValue(sp.method),
    plan: paramValue(sp.plan),
    q: paramValue(sp.q),
    from: paramValue(sp.from),
    to: paramValue(sp.to),
  };
  const page = Math.max(1, Number(paramValue(sp.page) || "1") || 1);

  const svc = getServiceClient();

  const [{ data: planRows }, result] = await Promise.all([
    svc.from("plans").select("code").order("sort_order", { ascending: true }),
    listSubscriptions(svc, {
      status: filterState.status || undefined,
      payment_method: filterState.payment_method || undefined,
      plan: filterState.plan || undefined,
      q: filterState.q || undefined,
      from: rangeIsoBoundary(filterState.from, "from"),
      to: rangeIsoBoundary(filterState.to, "to"),
      page,
    }),
  ]);

  const planCodes = (planRows ?? []).map((row) => row.code);

  const buildQueryString = (override: Partial<SubscriptionFilterState> & { page?: number }) => {
    const params = new URLSearchParams();
    const status = override.status ?? filterState.status;
    const method = override.payment_method ?? filterState.payment_method;
    const plan = override.plan ?? filterState.plan;
    const q = override.q ?? filterState.q;
    const from = override.from ?? filterState.from;
    const to = override.to ?? filterState.to;
    const targetPage = override.page ?? page;
    if (status) params.set("status", status);
    if (method) params.set("method", method);
    if (plan) params.set("plan", plan);
    if (q) params.set("q", q);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (targetPage > 1) params.set("page", String(targetPage));
    return params.toString();
  };

  const buildHref = (target: number) => {
    const qs = buildQueryString({ page: target });
    return qs ? `/${locale}/admin/subscriptions?${qs}` : `/${locale}/admin/subscriptions`;
  };

  const csvQs = buildQueryString({ page: 1 });
  const csvHref = csvQs ? `/api/admin/subscriptions.csv?${csvQs}` : `/api/admin/subscriptions.csv`;

  return (
    <AdminShell operatorEmail={operatorEmail}>
      <Box className="mb-6">
        <Text variant="h1" as="h1" className="text-text-primary">
          Subscriptions
        </Text>
        <Text variant="body" className="mt-1 text-text-secondary">
          Filter, paginate, export. Each row links to the user it belongs to.
        </Text>
      </Box>

      <Box className="mb-6">
        <SubscriptionFilters
          pathname={`/${locale}/admin/subscriptions`}
          state={filterState}
          planCodes={planCodes}
          csvHref={csvHref}
        />
      </Box>

      <Box className="overflow-hidden rounded-lg border border-line-soft bg-bg-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-cream-deep text-xs uppercase tracking-wide text-text-tertiary">
            <tr>
              <th className="px-4 py-3 font-semibold">User</th>
              <th className="px-4 py-3 font-semibold">Plan</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Method</th>
              <th className="px-4 py-3 font-semibold">Amount</th>
              <th className="px-4 py-3 font-semibold">Window</th>
              <th className="px-4 py-3 font-semibold">By</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-text-tertiary">
                  No subscriptions match those filters.
                </td>
              </tr>
            ) : (
              result.rows.map((row) => (
                <tr key={row.id} className="border-t border-line-soft align-top">
                  <td className="px-4 py-3 text-text-primary">
                    <Link
                      href={`/admin/users/${row.user_id}`}
                      className="font-medium underline underline-offset-2"
                    >
                      {row.user_email ?? row.user_id}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {row.plan_name ?? row.plan_code ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={row.status === "active" ? "success" : "neutral"}>
                      {row.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{row.payment_method}</td>
                  <td className="px-4 py-3 text-text-secondary">
                    {xafFormatter.format(row.amount_xaf)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-text-secondary">
                    {formatDate(row.valid_from)} → {formatDate(row.valid_until)}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {row.assigned_by_email ?? row.assigned_by.slice(0, 8)}
                  </td>
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
