import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Box, Text } from "@/components/primitives";
import { LandingNav } from "@/components/public/LandingNav";
import { PricingTiles } from "@/components/public/PricingTiles";
import { getServerClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ locale: string }> };

// Pricing depends on Supabase env at request time; render dynamically so
// the build passes without env vars seeded and an operator plan edit
// shows up on the next request rather than waiting on revalidation.
export const dynamic = "force-dynamic";

/**
 * Public pricing page. Reads `plans` from Supabase server-side, renders
 * one card per active plan. No checkout CTA — the only payment-adjacent
 * element is the cross-grid note linking to /how-to-pay.
 */
export default async function PricingPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("pricing");

  const sb = await getServerClient();
  const { data: plans, error } = await sb
    .from("plans")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("price_xaf", { ascending: true });

  return (
    <div className="min-h-screen flex flex-col">
      <main className="mx-auto w-full max-w-5xl px-6 py-10 sm:py-16 flex-1">
        <LandingNav />
        <Box className="mt-10">
          <Text variant="h1" as="h1" className="text-text-primary">
            {t("title")}
          </Text>
          <Text variant="body" className="mt-3 text-text-secondary">
            {t("subtitle")}
          </Text>
        </Box>

        {error ? (
          <Box className="mt-10 rounded-md border border-line-soft bg-cream-deep p-6">
            <Text variant="body" className="text-cream-ink">
              {t("loadError")}
            </Text>
          </Box>
        ) : (
          <PricingTiles plans={plans ?? []} locale={locale} />
        )}

        <Box className="mt-10 rounded-md border border-line-soft bg-bg-card p-6">
          <Text variant="body" className="text-text-secondary">
            {t("antiSteeringNote")}
          </Text>
          <Box className="mt-4">
            <Link
              href="/how-to-pay"
              className="inline-flex items-center justify-center rounded-md bg-cta px-5 py-2.5 text-sm font-semibold text-cta-ink hover:opacity-90"
            >
              {t("antiSteeringCta")}
            </Link>
          </Box>
        </Box>
      </main>
    </div>
  );
}
