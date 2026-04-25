import { setRequestLocale } from "next-intl/server";
import { Box, Text, Badge } from "@/components/primitives";
import { AdminShell } from "@/components/admin/AdminShell";
import { requireOperator } from "@/lib/auth/requireOperator";
import { getServerClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";

type Props = {
  params: Promise<{ locale: string }>;
};

const xafFormatter = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "XAF",
  maximumFractionDigits: 0,
});

export default async function AdminPlansPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const sb = await getServerClient();
  const { email: operatorEmail } = await requireOperator(sb);

  const svc = getServiceClient();
  const { data: plans } = await svc
    .from("plans")
    .select("id, code, name, price_xaf, duration_days, is_active, sort_order, created_at")
    .order("sort_order", { ascending: true });

  return (
    <AdminShell operatorEmail={operatorEmail}>
      <Box className="mb-6">
        <Text variant="h1" as="h1" className="text-text-primary">
          Plans
        </Text>
        <Text variant="body" className="mt-1 text-text-secondary">
          Plans change via SQL migration only in v1. This view is read-only.
        </Text>
      </Box>

      <Box className="overflow-hidden rounded-lg border border-line-soft bg-bg-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-cream-deep text-xs uppercase tracking-wide text-text-tertiary">
            <tr>
              <th className="px-4 py-3 font-semibold">Code</th>
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Price</th>
              <th className="px-4 py-3 font-semibold">Duration</th>
              <th className="px-4 py-3 font-semibold">Sort</th>
              <th className="px-4 py-3 font-semibold">Active</th>
            </tr>
          </thead>
          <tbody>
            {(plans ?? []).length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-text-tertiary">
                  No plans seeded yet.
                </td>
              </tr>
            ) : (
              (plans ?? []).map((row) => (
                <tr key={row.id} className="border-t border-line-soft">
                  <td className="px-4 py-3 font-mono text-xs text-text-secondary">{row.code}</td>
                  <td className="px-4 py-3 text-text-primary">{row.name}</td>
                  <td className="px-4 py-3 text-text-secondary">
                    {xafFormatter.format(row.price_xaf)}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{row.duration_days} d</td>
                  <td className="px-4 py-3 text-text-secondary">{row.sort_order}</td>
                  <td className="px-4 py-3">
                    {row.is_active ? (
                      <Badge tone="success">active</Badge>
                    ) : (
                      <Badge tone="neutral">inactive</Badge>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Box>
    </AdminShell>
  );
}
