import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Box, Text } from "@/components/primitives";

type Props = { params: Promise<{ locale: string }> };

/**
 * Admin sign-in placeholder. Wired in W2 with @supabase/ssr server helpers +
 * the operator-only RLS policy on `admin_users`. The middleware excludes
 * `/admin` from the i18n matcher, so this page is reachable at /admin/login
 * without a locale prefix as well; the locale-prefixed variant exists too so
 * Next finds the route under the route group.
 */
export default async function AdminLoginPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="min-h-screen flex flex-col">
      <main className="mx-auto w-full max-w-md px-6 py-16 flex-1">
        <Box className="mb-8">
          <Link
            href="/"
            className="inline-block text-sm text-text-secondary underline underline-offset-4 hover:text-text-primary"
          >
            ← DeutschFit
          </Link>
        </Box>
        <Text variant="h1" as="h1" className="text-text-primary">
          Admin sign-in
        </Text>
        <Box className="mt-6 rounded-md border border-line-soft bg-cream-deep p-6">
          <Text variant="body" className="text-cream-ink">
            Magic-link sign-in for the operator. Wired up in W2.
          </Text>
        </Box>
      </main>
    </div>
  );
}
