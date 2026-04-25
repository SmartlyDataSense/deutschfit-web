import { setRequestLocale, getTranslations } from "next-intl/server";
import { Box, Card, Text } from "@/components/primitives";
import { LandingNav } from "@/components/public/LandingNav";

type Props = { params: Promise<{ locale: string }> };

// Read at request time so an operator can rotate handles without a
// redeploy. The values come from server-only env vars (NEXT_PUBLIC_*
// prefix is required because Next.js inlines NEXT_PUBLIC_* at build time
// only — these are read in an RSC, so they don't need it, but the
// convention agreed upstream is NEXT_PUBLIC_PAY_* per the W3 prompt).
export const dynamic = "force-dynamic";

type Channel = {
  id: string;
  region: "cm" | "diaspora";
  titleKey: "momoTitle" | "omTitle" | "bankTitle" | "paypalTitle" | "wiseTitle";
  bodyKey: "momoBody" | "omBody" | "bankBody" | "paypalBody" | "wiseBody";
  envValue: string | undefined;
  bodyParams: (value: string) => Record<string, string>;
  noteKey?: "bankNote";
};

function buildChannels(): Channel[] {
  return [
    {
      id: "momo",
      region: "cm",
      titleKey: "momoTitle",
      bodyKey: "momoBody",
      envValue: process.env.NEXT_PUBLIC_PAY_MOMO_NUMBER,
      bodyParams: (number) => ({ number }),
    },
    {
      id: "om",
      region: "cm",
      titleKey: "omTitle",
      bodyKey: "omBody",
      envValue: process.env.NEXT_PUBLIC_PAY_OM_NUMBER,
      bodyParams: (number) => ({ number }),
    },
    {
      id: "bank",
      region: "diaspora",
      titleKey: "bankTitle",
      bodyKey: "bankBody",
      envValue: process.env.NEXT_PUBLIC_PAY_BANK_DETAILS,
      bodyParams: (details) => ({ details }),
      noteKey: "bankNote",
    },
    {
      id: "paypal",
      region: "diaspora",
      titleKey: "paypalTitle",
      bodyKey: "paypalBody",
      envValue: process.env.NEXT_PUBLIC_PAY_PAYPAL_HANDLE,
      bodyParams: (handle) => ({ handle }),
    },
    {
      id: "wise",
      region: "diaspora",
      titleKey: "wiseTitle",
      bodyKey: "wiseBody",
      envValue: process.env.NEXT_PUBLIC_PAY_WISE_HANDLE,
      bodyParams: (handle) => ({ handle }),
    },
  ];
}

export default async function HowToPayPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("payinfo");

  const channels = buildChannels();
  const supportEmail = process.env.NEXT_PUBLIC_PAY_EMAIL ?? "";

  for (const ch of channels) {
    if (!ch.envValue) {
      console.warn(
        `[how-to-pay] env var for channel "${ch.id}" is missing — rendering "coming soon" placeholder.`
      );
    }
  }
  if (!supportEmail) {
    console.warn(
      "[how-to-pay] NEXT_PUBLIC_PAY_EMAIL is missing — proof-of-payment instruction will not include an address."
    );
  }

  const cameroonChannels = channels.filter((c) => c.region === "cm");
  const diasporaChannels = channels.filter((c) => c.region === "diaspora");

  return (
    <div className="min-h-screen flex flex-col">
      <main className="mx-auto w-full max-w-5xl px-6 py-10 sm:py-16 flex-1">
        <LandingNav />
        <Box className="mt-10">
          <Text variant="h1" as="h1" className="text-text-primary">
            {t("title")}
          </Text>
          <Text variant="body" className="mt-3 text-text-secondary">
            {t("intro")}
          </Text>
        </Box>

        <section className="mt-10">
          <Text variant="h3" as="h2" className="mb-4 text-text-primary">
            {t("cameroonHeader")}
          </Text>
          <Box className="grid gap-4 sm:grid-cols-2">
            {cameroonChannels.map((ch) => (
              <ChannelCard key={ch.id} channel={ch} />
            ))}
          </Box>
        </section>

        <section className="mt-10">
          <Text variant="h3" as="h2" className="mb-4 text-text-primary">
            {t("diasporaHeader")}
          </Text>
          <Box className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {diasporaChannels.map((ch) => (
              <ChannelCard key={ch.id} channel={ch} />
            ))}
          </Box>
        </section>

        <Box className="mt-12 rounded-md border border-line-soft bg-bg-card p-6">
          <Text variant="h3" as="h2" className="text-text-primary">
            {t("proofTitle")}
          </Text>
          <Text variant="body" className="mt-2 text-text-secondary">
            {supportEmail
              ? t("proofBody", { email: supportEmail })
              : t("proofBody", { email: "support@deutschfit.app" })}
          </Text>
        </Box>
      </main>
    </div>
  );
}

async function ChannelCard({ channel }: { channel: Channel }) {
  const t = await getTranslations("payinfo");
  const title = t(channel.titleKey);
  const value = channel.envValue;

  return (
    <Card>
      <Text variant="h3" as="h3" className="text-text-primary">
        {title}
      </Text>
      <Text variant="body" className="mt-3 text-text-secondary">
        {value ? t(channel.bodyKey, channel.bodyParams(value)) : t("comingSoon")}
      </Text>
      {value && channel.noteKey ? (
        <Text variant="caption" className="mt-3 text-text-tertiary">
          {t(channel.noteKey)}
        </Text>
      ) : null}
    </Card>
  );
}
