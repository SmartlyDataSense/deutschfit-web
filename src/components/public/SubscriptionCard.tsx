import { getTranslations } from "next-intl/server";
import { Card, Text } from "@/components/primitives";

type Subscription = {
  planName: string;
  validFrom: string;
  validUntil: string;
};

type Props = { subscription: Subscription | null };

/**
 * Read-only summary of the user's most recent active subscription, if any.
 * No upgrade/cancel buttons — that's an operator-only action.
 */
export async function SubscriptionCard({ subscription }: Props) {
  const t = await getTranslations("account");
  return (
    <Card className="mt-6">
      <Text variant="h3" as="h2" className="text-text-primary">
        {t("subscriptionHeading")}
      </Text>
      {subscription ? (
        <Text variant="body" className="mt-3 text-text-secondary">
          {t("subscriptionRow", {
            plan: subscription.planName,
            from: subscription.validFrom.slice(0, 10),
            until: subscription.validUntil.slice(0, 10),
          })}
        </Text>
      ) : (
        <Text variant="body" className="mt-3 text-text-secondary">
          {t("subscriptionNone")}
        </Text>
      )}
    </Card>
  );
}
