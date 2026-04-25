import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Box, Card, Text } from "@/components/primitives";

type Props = {
  tier: string | null;
  validUntil: string | null;
};

/**
 * Read-only summary of the user's current entitlement tier. No CTAs to
 * change a plan from here — operators activate plans manually after an
 * out-of-band payment, so the only forward link is to /pricing.
 */
export async function EntitlementCard({ tier, validUntil }: Props) {
  const t = await getTranslations("account");
  const isFree = !tier || tier === "free";

  const formattedValidUntil = validUntil
    ? new Date(validUntil).toISOString().slice(0, 10)
    : null;

  return (
    <Card className="mt-6">
      <Text variant="h3" as="h2" className="text-text-primary">
        {t("entitlementHeading")}
      </Text>
      <Box className="mt-3">
        <Text variant="body" className="text-text-primary">
          {isFree ? t("entitlementFree") : tier}
        </Text>
        {!isFree && formattedValidUntil ? (
          <Text variant="small" className="mt-1 text-text-secondary">
            {t("entitlementValidUntil", { date: formattedValidUntil })}
          </Text>
        ) : null}
      </Box>
      {isFree ? (
        <Box className="mt-4">
          <Link
            href="/pricing"
            className="inline-flex items-center justify-center rounded-md bg-cream-deep px-4 py-2 text-sm font-semibold text-cream-ink hover:bg-cream"
          >
            {t("entitlementSeePricing")}
          </Link>
        </Box>
      ) : null}
    </Card>
  );
}
