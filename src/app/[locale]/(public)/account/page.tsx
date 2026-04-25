import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Box, Text } from "@/components/primitives";

type Props = { params: Promise<{ locale: string }> };

/**
 * Account placeholder. Real magic-link sign-in + subscription management
 * lands in W2 once the Supabase auth helpers are wired. For now this just
 * holds the URL so /account doesn't 404.
 */
export default async function AccountPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("account");

  return (
    <div className="min-h-screen flex flex-col">
      <main className="mx-auto w-full max-w-3xl px-6 py-10 sm:py-16 flex-1">
        <Box className="mb-8">
          <Link
            href="/"
            className="inline-block text-sm text-text-secondary underline underline-offset-4 hover:text-text-primary"
          >
            ← DeutschFit
          </Link>
        </Box>
        <Text variant="h1" as="h1" className="text-text-primary">
          {t("title")}
        </Text>
        <Box className="mt-8 rounded-md border border-line-soft bg-cream-deep p-6">
          <Text variant="body" className="text-cream-ink">
            {t("comingSoon")}
          </Text>
        </Box>
      </main>
    </div>
  );
}
