import { setRequestLocale } from "next-intl/server";

/**
 * Admin pages depend on `cookies()` (Supabase SSR client) and run an
 * operator-gate query against the database on every request. They cannot
 * be statically pre-rendered, so we opt the entire segment out of the
 * static-export pass.
 */
export const dynamic = "force-dynamic";

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

/**
 * Top-level admin segment shell. Intentionally minimal: it locks the
 * locale and renders children. The operator gate is enforced per-page
 * via `requireOperator()`, which keeps the unauthenticated /admin/login
 * route reachable while still 404'ing every gated page for non-operators.
 *
 * Pages that need the AdminNav chrome render `<AdminShell>` themselves
 * after calling `requireOperator()` so the gate fires before any
 * service-role read or audit-row write.
 */
export default async function AdminLayout({ children, params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <div className="min-h-screen bg-cream-deep">{children}</div>;
}
