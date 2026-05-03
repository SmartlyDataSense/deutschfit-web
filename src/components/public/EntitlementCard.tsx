import { getTranslations } from "next-intl/server";
import { Box, Card, Text } from "@/components/primitives";

type Props = {
  tier: string | null;
  validUntil: string | null;
};

/** Read-only summary of the user's current entitlement tier. */
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
    </Card>
  );
}
