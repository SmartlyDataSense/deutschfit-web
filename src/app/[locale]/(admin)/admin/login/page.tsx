import { setRequestLocale } from "next-intl/server";
import { Box, Text } from "@/components/primitives";
import { Link } from "@/i18n/navigation";
import { AdminLoginForm } from "./AdminLoginForm";

type Props = { params: Promise<{ locale: string }> };

/**
 * Admin sign-in page. Magic-link entry only — operators are seeded
 * server-side via `user_profiles.is_operator = true`. The auth gate
 * (`requireOperator()`) lives on the dashboard layout, so a successful
 * sign-in by a non-operator account silently 404s instead of leaking the
 * existence of the operator surface.
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
        <Text variant="body" className="mt-3 text-text-secondary">
          Operator-only entry. Use the email seeded in <code>user_profiles</code>.
        </Text>
        <Box className="mt-8">
          <AdminLoginForm locale={locale} />
        </Box>
      </main>
    </div>
  );
}
