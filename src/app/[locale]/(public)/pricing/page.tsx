import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Box, Text } from "@/components/primitives";

type Props = { params: Promise<{ locale: string }> };

/**
 * Pricing page placeholder. The real plan grid + checkout CTA lands in W2/W3
 * once Supabase plans/products are wired. For now this serves the URL so the
 * landing nav and external "/pricing" links don't 404.
 */
export default async function PricingPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("pricing");

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
        <Text variant="body" className="mt-3 text-text-secondary">
          {t("subtitle")}
        </Text>
        <Box className="mt-10 rounded-md border border-line-soft bg-cream-deep p-6">
          <Text variant="body" className="text-cream-ink">
            {t("comingSoon")}
          </Text>
          <Box className="mt-4">
            <Link
              href="/how-to-pay"
              className="inline-flex items-center justify-center rounded-md bg-cta px-5 py-2.5 text-sm font-semibold text-cta-ink hover:opacity-90"
            >
              {t("ctaToHowToPay")}
            </Link>
          </Box>
        </Box>
      </main>
    </div>
  );
}
