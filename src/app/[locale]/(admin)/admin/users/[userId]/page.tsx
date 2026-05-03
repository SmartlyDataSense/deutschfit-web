import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { Box, Text, Badge } from "@/components/primitives";
import { AdminShell } from "@/components/admin/AdminShell";
import { AssignPlanForm, type PlanOption } from "@/components/admin/AssignPlanForm";
import { RevokeForm } from "@/components/admin/RevokeForm";
import { ResetTrialForm } from "@/components/admin/ResetTrialForm";
import { requireOperator } from "@/lib/auth/requireOperator";
import { getServerClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { loadUserDetail } from "@/lib/admin/userQueries";

type Props = {
  params: Promise<{ locale: string; userId: string }>;
};

const xafFormatter = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "XAF",
  maximumFractionDigits: 0,
});

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toISOString().slice(0, 16).replace("T", " ");
}

export default async function AdminUserDetailPage({ params }: Props) {
  const { locale, userId } = await params;
  setRequestLocale(locale);

  const sb = await getServerClient();
  const { email: operatorEmail } = await requireOperator(sb);

  const svc = getServiceClient();
  const detail = await loadUserDetail(svc, userId);
  if (!detail) {
    notFound();
  }

  const { data: planRows } = await svc
    .from("plans")
    .select("id, code, name, price_xaf, duration_days, is_active, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  const plans: PlanOption[] = (planRows ?? []).map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    price_xaf: row.price_xaf,
    duration_days: row.duration_days,
  }));

  const activeSubscriptions = detail.subscriptions.filter((s) => s.status === "active");

  return (
    <AdminShell operatorEmail={operatorEmail}>
      <Box className="mb-6">
        <Text variant="h1" as="h1" className="text-text-primary">
          {detail.email ?? detail.user_id}
        </Text>
        <Text variant="small" className="mt-1 font-mono text-text-tertiary">
          {detail.user_id}
        </Text>
        <Box className="mt-2 flex flex-wrap items-center gap-2">
          {detail.is_operator ? <Badge tone="cta">Operator</Badge> : null}
          {detail.entitlement?.tier ? (
            <Badge tone="success">Tier: {detail.entitlement.tier}</Badge>
          ) : (
            <Badge tone="neutral">No tier</Badge>
          )}
          {detail.entitlement?.valid_until ? (
            <Text variant="small" className="text-text-secondary">
              valid until {formatDate(detail.entitlement.valid_until)}
            </Text>
          ) : null}
        </Box>
      </Box>

      <section className="mb-8">
        <AssignPlanForm userId={detail.user_id} plans={plans} />
      </section>

      <section className="mb-8">
        <Text variant="h2" as="h2" className="text-text-primary">
          Subscriptions
        </Text>
        <Box className="mt-3 overflow-hidden rounded-lg border border-line-soft bg-bg-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-cream-deep text-xs uppercase tracking-wide text-text-tertiary">
              <tr>
                <th className="px-4 py-3 font-semibold">Plan</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Method</th>
                <th className="px-4 py-3 font-semibold">Ref</th>
                <th className="px-4 py-3 font-semibold">Amount</th>
                <th className="px-4 py-3 font-semibold">Window</th>
                <th className="px-4 py-3 font-semibold">By</th>
                <th className="px-4 py-3 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {detail.subscriptions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-text-tertiary">
                    No subscriptions yet.
                  </td>
                </tr>
              ) : (
                detail.subscriptions.map((sub) => (
                  <tr key={sub.id} className="border-t border-line-soft align-top">
                    <td className="px-4 py-3 text-text-primary">
                      {sub.plan_name ?? sub.plan_code ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={sub.status === "active" ? "success" : "neutral"}>
                        {sub.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{sub.payment_method}</td>
                    <td className="px-4 py-3 font-mono text-xs text-text-secondary">
                      {sub.payment_ref ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {xafFormatter.format(sub.amount_xaf)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-text-secondary">
                      {formatDate(sub.valid_from)}
                      <br />→ {formatDate(sub.valid_until)}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {sub.assigned_by_email ?? sub.assigned_by.slice(0, 8)}
                    </td>
                    <td className="px-4 py-3">
                      {sub.status === "active" ? (
                        <RevokeForm
                          userId={detail.user_id}
                          subscriptionId={sub.id}
                          label={sub.plan_name ?? sub.plan_code ?? "subscription"}
                        />
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Box>
        {activeSubscriptions.length > 1 ? (
          <Text variant="small" className="mt-2 text-warning-red">
            Note: more than one active subscription. The revoke action targets the row inline;
            revoke older ones explicitly if needed.
          </Text>
        ) : null}
      </section>

      <section className="mb-8">
        <Text variant="h2" as="h2" className="text-text-primary">
          Trial usage
        </Text>
        <Box className="mt-3 rounded-lg border border-line-soft bg-bg-card p-4">
          {detail.trial_usage.length === 0 ? (
            <Text variant="small" className="text-text-tertiary">
              No trial activity recorded.
            </Text>
          ) : (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {detail.trial_usage.map((row) => (
                <li
                  key={row.kind}
                  className="rounded-md border border-line-soft px-3 py-2 text-sm text-text-secondary"
                >
                  <span className="font-mono text-xs text-text-tertiary">{row.kind}</span>
                  <br />
                  <span className="text-text-primary">{row.count}</span>
                </li>
              ))}
            </ul>
          )}
          <Box className="mt-3">
            <ResetTrialForm userId={detail.user_id} />
          </Box>
        </Box>
      </section>

      <section className="mb-8">
        <Text variant="h2" as="h2" className="text-text-primary">
          Audit log
        </Text>
        <Box className="mt-3 overflow-hidden rounded-lg border border-line-soft bg-bg-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-cream-deep text-xs uppercase tracking-wide text-text-tertiary">
              <tr>
                <th className="px-4 py-3 font-semibold">When</th>
                <th className="px-4 py-3 font-semibold">Action</th>
                <th className="px-4 py-3 font-semibold">By</th>
                <th className="px-4 py-3 font-semibold">Reason</th>
              </tr>
            </thead>
            <tbody>
              {detail.audit.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-text-tertiary">
                    No audit entries.
                  </td>
                </tr>
              ) : (
                detail.audit.map((row) => (
                  <tr key={row.id} className="border-t border-line-soft">
                    <td className="px-4 py-3 font-mono text-xs text-text-secondary">
                      {formatDate(row.created_at)}
                    </td>
                    <td className="px-4 py-3 text-text-primary">{row.action}</td>
                    <td className="px-4 py-3 text-text-secondary">
                      {row.actor_email ?? row.actor_id.slice(0, 8)}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{row.reason ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Box>
      </section>
    </AdminShell>
  );
}
