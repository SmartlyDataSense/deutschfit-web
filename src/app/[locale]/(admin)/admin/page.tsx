import { setRequestLocale } from "next-intl/server";
import { Box, Text } from "@/components/primitives";
import { AdminShell } from "@/components/admin/AdminShell";
import { KpiTile } from "@/components/admin/KpiTile";
import { RecentActivityFeed } from "@/components/admin/RecentActivityFeed";
import { requireOperator } from "@/lib/auth/requireOperator";
import { getServerClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import {
  getActiveByPlan,
  getActiveSubscribers,
  getMrrXaf,
  getRecentActivity,
  getTrialUsageThisMonth,
} from "@/lib/admin/kpiQueries";

type Props = { params: Promise<{ locale: string }> };

const XAF_FORMAT = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "XAF",
  maximumFractionDigits: 0,
});

const TRIAL_LABEL: Record<string, string> = {
  schreiben_grade: "Writing grades",
  sprechen_grade: "Speaking grades",
  lesen_set: "Reading sets",
  hoeren_set: "Listening sets",
  coach_message: "Coach messages",
  mock_exam: "Mock exams",
};

export default async function AdminDashboardPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const sb = await getServerClient();
  const { email } = await requireOperator(sb);

  const svc = getServiceClient();

  // Fan out KPI reads in parallel — they're independent.
  const [activeCount, byPlan, mrr, trialTotals, recent] = await Promise.all([
    getActiveSubscribers(svc),
    getActiveByPlan(svc),
    getMrrXaf(svc),
    getTrialUsageThisMonth(svc),
    getRecentActivity(svc, 20),
  ]);

  const topPlan = byPlan[0];
  const topPlanLabel = topPlan ? `${topPlan.plan_code} (${topPlan.count})` : "—";

  const trialTopline = trialTotals.length
    ? trialTotals
        .slice(0, 2)
        .map((row) => `${TRIAL_LABEL[row.kind] ?? row.kind}: ${row.total}`)
        .join(" · ")
    : "—";

  return (
    <AdminShell operatorEmail={email}>
      <Box className="mb-6">
        <Text variant="h1" as="h1" className="text-text-primary">
          Dashboard
        </Text>
        <Text variant="body" className="mt-1 text-text-secondary">
          Operator overview — KPIs and recent audit activity.
        </Text>
      </Box>

      <Box className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label="Active subscribers" value={String(activeCount)} />
        <KpiTile
          label="MRR (XAF, monthly plans)"
          value={XAF_FORMAT.format(mrr)}
          hint="Sum of amount_xaf on active subs whose plan duration ≤ 31d"
        />
        <KpiTile label="Top plan" value={topPlanLabel} />
        <KpiTile
          label="Trial usage (lifetime)"
          value={String(trialTotals.reduce((sum, r) => sum + r.total, 0))}
          hint={trialTopline}
        />
      </Box>

      <Box className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {byPlan.length > 0 ? (
          <Box className="rounded-lg border border-line-soft bg-bg-card p-6 lg:col-span-1">
            <Text variant="h3" as="h2" className="text-text-primary">
              Active by plan
            </Text>
            <ul className="mt-3 space-y-2 text-sm">
              {byPlan.map((row) => (
                <li
                  key={row.plan_id}
                  className="flex items-center justify-between text-text-secondary"
                >
                  <span className="font-mono text-xs uppercase tracking-wide">{row.plan_code}</span>
                  <span className="text-text-primary">{row.count}</span>
                </li>
              ))}
            </ul>
          </Box>
        ) : null}

        <Box className="lg:col-span-2">
          <Text variant="h3" as="h2" className="mb-3 text-text-primary">
            Recent activity
          </Text>
          <RecentActivityFeed rows={recent} />
        </Box>
      </Box>
    </AdminShell>
  );
}
