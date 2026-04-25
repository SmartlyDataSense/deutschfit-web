import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Box, Text } from "@/components/primitives";

type Props = { params: Promise<{ locale: string }> };

/**
 * How-to-pay placeholder. Real payment-method instructions (mobile money, OM,
 * bank transfer, PayPal, Wise) land in W2/W3 once the operator-handle env vars
 * are wired. For now this just holds the URL.
 */
export default async function HowToPayPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("howToPay");

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
          <Box className="mt-4">
            <a
              href="mailto:lordmoyojordan@gmail.com"
              className="inline-flex items-center justify-center rounded-md bg-cta px-5 py-2.5 text-sm font-semibold text-cta-ink hover:opacity-90"
            >
              {t("supportEmail")}
            </a>
          </Box>
        </Box>
      </main>
    </div>
  );
}
