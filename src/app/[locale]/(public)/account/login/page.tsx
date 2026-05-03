import { setRequestLocale, getTranslations } from "next-intl/server";
import { Box, Text } from "@/components/primitives";
import { LandingNav } from "@/components/public/LandingNav";
import { MagicLinkForm } from "@/components/public/MagicLinkForm";

type Props = { params: Promise<{ locale: string }> };

/**
 * Magic-link login entry point. Submits to a server action that calls
 * `signInWithOtp` via the `@supabase/ssr` server client. The user clicks
 * the link in their inbox, which lands on `/[locale]/account/auth/callback`.
 */
export default async function LoginPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth");

  return (
    <div className="min-h-screen flex flex-col">
      <main className="mx-auto w-full max-w-md px-6 py-10 sm:py-16 flex-1">
        <LandingNav />
        <Box className="mt-12">
          <Text variant="h1" as="h1" className="text-text-primary">
            {t("title")}
          </Text>
          <Text variant="body" className="mt-3 text-text-secondary">
            {t("subtitle")}
          </Text>
          <MagicLinkForm />
        </Box>
      </main>
    </div>
  );
}
