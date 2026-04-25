import { setRequestLocale } from "next-intl/server";
import { Box, Text } from "@/components/primitives";
import { Link } from "@/i18n/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { Pagination } from "@/components/admin/Pagination";
import { UserSearchBar } from "@/components/admin/UserSearchBar";
import { requireOperator } from "@/lib/auth/requireOperator";
import { getServerClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { searchUsers } from "@/lib/admin/userQueries";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function paramValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default async function AdminUsersPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const sb = await getServerClient();
  const { email: operatorEmail } = await requireOperator(sb);

  const sp = await searchParams;
  const q = paramValue(sp.q);
  const page = Math.max(1, Number(paramValue(sp.page) || "1") || 1);

  const svc = getServiceClient();
  const result = await searchUsers(svc, { q, page });

  const buildHref = (target: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (target > 1) params.set("page", String(target));
    const qs = params.toString();
    return qs ? `/${locale}/admin/users?${qs}` : `/${locale}/admin/users`;
  };

  return (
    <AdminShell operatorEmail={operatorEmail}>
      <Box className="mb-6">
        <Text variant="h1" as="h1" className="text-text-primary">
          Users
        </Text>
        <Text variant="body" className="mt-1 text-text-secondary">
          Search by email substring, click through to manage subscriptions.
        </Text>
      </Box>

      <Box className="mb-6">
        <UserSearchBar query={q} pathname={`/${locale}/admin/users`} />
      </Box>

      <Box className="overflow-hidden rounded-lg border border-line-soft bg-bg-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-cream-deep text-xs uppercase tracking-wide text-text-tertiary">
            <tr>
              <th className="px-4 py-3 font-semibold">Email</th>
              <th className="px-4 py-3 font-semibold">Tier</th>
              <th className="px-4 py-3 font-semibold">Valid until</th>
              <th className="px-4 py-3 font-semibold">Operator</th>
              <th className="px-4 py-3 font-semibold">Created</th>
              <th className="px-4 py-3 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {result.rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-text-tertiary">
                  No matching users.
                </td>
              </tr>
            ) : (
              result.rows.map((row) => (
                <tr key={row.user_id} className="border-t border-line-soft">
                  <td className="px-4 py-3 text-text-primary">{row.email ?? row.user_id}</td>
                  <td className="px-4 py-3 text-text-secondary">{row.current_tier ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-text-secondary">
                    {row.current_valid_until ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {row.is_operator ? "Yes" : "No"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-text-secondary">
                    {row.created_at?.slice(0, 10) ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/users/${row.user_id}`}
                      className="text-sm font-medium text-cta underline underline-offset-2"
                    >
                      Open →
                    </Link>
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
