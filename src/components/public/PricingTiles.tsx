import { getTranslations } from "next-intl/server";
import { Box, Card, Text, Badge } from "@/components/primitives";
import type { Database } from "@/shared/database.types";

type Plan = Database["public"]["Tables"]["plans"]["Row"];

type Props = {
  plans: Plan[];
  locale: string;
};

const xafFormatter = new Intl.NumberFormat("fr-CM", {
  style: "currency",
  currency: "XAF",
  maximumFractionDigits: 0,
});

function formatPrice(priceXaf: number): string {
  return xafFormatter.format(priceXaf);
}

/**
 * Pricing grid. Renders one card per plan returned by the database — no
 * hard-coded codes, no checkout buttons (anti-steering: subscriptions
 * activate manually after out-of-band payment, see /how-to-pay).
 */
export async function PricingTiles({ plans, locale }: Props) {
  const t = await getTranslations("pricing");

  if (plans.length === 0) {
    return (
      <Box className="mt-10 rounded-md border border-line-soft bg-cream-deep p-6">
        <Text variant="body" className="text-cream-ink">
          {t("empty")}
        </Text>
      </Box>
    );
  }

  return (
    <Box
      className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      role="list"
      aria-label={t("title")}
    >
      {plans.map((plan) => {
        const displayName = locale === "fr" ? plan.name_fr : plan.name;
        return (
          <Card key={plan.id} role="listitem" className="flex flex-col gap-3">
            <Box className="flex items-start justify-between gap-3">
              <Text variant="h3" as="h2" className="text-text-primary">
                {displayName}
              </Text>
              <Badge tone="neutral">{plan.kind}</Badge>
            </Box>
            <Text variant="display" as="p" className="text-text-primary">
              {formatPrice(plan.price_xaf)}
            </Text>
            <Text variant="small" className="text-text-secondary">
              {t("durationDays", { days: plan.duration_days })}
            </Text>
            <Text variant="caption" className="mt-2 text-text-tertiary">
              {plan.code}
            </Text>
          </Card>
        );
      })}
    </Box>
  );
}
