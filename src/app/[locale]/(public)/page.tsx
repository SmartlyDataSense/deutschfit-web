import { setRequestLocale, getTranslations } from "next-intl/server";
import { LandingNav } from "@/components/public/LandingNav";
import { LandingHero } from "@/components/public/LandingHero";
import { Box, Text } from "@/components/primitives";
import { Link } from "@/i18n/navigation";

type Props = { params: Promise<{ locale: string }> };

export default async function LandingPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("landing");

  return (
    <div className="min-h-screen flex flex-col">
      <main className="mx-auto w-full max-w-3xl px-6 py-10 sm:py-16 flex-1">
        <LandingNav />
        <LandingHero headline={t("headline")} subhead={t("subhead")} />

        <Box className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/pricing"
            className="inline-flex items-center justify-center rounded-md bg-cta px-5 py-2.5 text-base font-semibold text-cta-ink hover:opacity-90"
          >
            {t("ctaPricing")}
          </Link>
          <Link
            href="/account"
            className="inline-flex items-center justify-center rounded-md bg-cream-deep px-5 py-2.5 text-base font-semibold text-cream-ink hover:bg-cream"
          >
            {t("ctaAccount")}
          </Link>
        </Box>

        <section className="mt-14">
          <Text variant="h3" as="h2" className="mb-3">
            {t("appHeading")}
          </Text>
          <Text variant="body" className="text-text-secondary">
            {t("appBody")}
          </Text>
        </section>

        <section className="mt-12">
          <Text variant="h3" as="h2" className="mb-4">
            {t("legalHeading")}
          </Text>
          <ul className="grid gap-2 text-text-secondary">
            <li>
              <Link href="/legal/privacy" className="underline underline-offset-4">
                {t("legal.privacy")}
              </Link>
            </li>
            <li>
              <Link href="/legal/tos" className="underline underline-offset-4">
                {t("legal.tos")}
              </Link>
            </li>
            <li>
              <Link href="/legal/about" className="underline underline-offset-4">
                {t("legal.about")}
              </Link>
            </li>
            <li>
              <Link href="/legal/impressum" className="underline underline-offset-4">
                {t("legal.impressum")}
              </Link>
            </li>
            <li>
              <Link href="/legal/refund" className="underline underline-offset-4">
                {t("legal.refund")}
              </Link>
            </li>
            <li>
              <a href="mailto:lordmoyojordan@gmail.com" className="underline underline-offset-4">
                {t("supportEmail")} — lordmoyojordan@gmail.com
              </a>
            </li>
          </ul>
        </section>
      </main>

      <footer className="border-t border-line-soft px-6 py-6">
        <Text variant="caption" className="mx-auto max-w-3xl text-center text-text-tertiary">
          {t("footer")}
        </Text>
      </footer>
    </div>
  );
}
