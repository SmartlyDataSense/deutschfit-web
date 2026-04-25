import { setRequestLocale, getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { Box, Text } from "@/components/primitives";
import { LandingNav } from "@/components/public/LandingNav";
import { EntitlementCard } from "@/components/public/EntitlementCard";
import { TrialUsageList } from "@/components/public/TrialUsageList";
import { SubscriptionCard } from "@/components/public/SubscriptionCard";
import { getServerClient } from "@/lib/supabase/server";
import { signOut } from "./actions";

type Props = { params: Promise<{ locale: string }> };

/**
 * Read-only account page. If the user has no session, redirect to the
 * locale-aware login. Otherwise, surface entitlement, trial usage, and
 * the most recent active subscription. No CTAs to change a plan from
 * here — operators do that.
 */
export default async function AccountPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("account");

  const sb = await getServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    // `redirect` from next-intl/navigation throws to abort rendering,
    // but TS can't narrow through it — guard explicitly afterwards.
    redirect({ href: "/account/login", locale });
    return null;
  }

  const userId = user.id;
  const nowIso = new Date().toISOString();

  const [entRes, trialRes, subRes] = await Promise.all([
    sb.from("entitlements").select("tier, valid_until").eq("user_id", userId).maybeSingle(),
    sb.from("trial_usage").select("kind, count").eq("user_id", userId),
    sb
      .from("subscriptions")
      .select("plan_id, status, valid_from, valid_until, plans:plan_id(name, name_fr)")
      .eq("user_id", userId)
      .eq("status", "active")
      .lte("valid_from", nowIso)
      .gte("valid_until", nowIso)
      .order("valid_from", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const entitlement = entRes.data ?? null;
  const trialRows = trialRes.data ?? [];

  type SubRow = {
    plan_id: string;
    status: string;
    valid_from: string;
    valid_until: string;
    plans: { name: string; name_fr: string } | { name: string; name_fr: string }[] | null;
  };
  const sub = subRes.data as SubRow | null;
  const subPlan = sub ? (Array.isArray(sub.plans) ? (sub.plans[0] ?? null) : sub.plans) : null;
  const subscription =
    sub && subPlan
      ? {
          planName: locale === "fr" ? subPlan.name_fr : subPlan.name,
          validFrom: sub.valid_from,
          validUntil: sub.valid_until,
        }
      : null;

  return (
    <div className="min-h-screen flex flex-col">
      <main className="mx-auto w-full max-w-3xl px-6 py-10 sm:py-16 flex-1">
        <LandingNav />
        <Box className="mt-10">
          <Text variant="h1" as="h1" className="text-text-primary">
            {t("title")}
          </Text>
          <Text variant="body" className="mt-2 text-text-secondary">
            {user.email}
          </Text>
        </Box>

        <EntitlementCard
          tier={entitlement?.tier ?? null}
          validUntil={entitlement?.valid_until ?? null}
        />
        <TrialUsageList rows={trialRows} />
        <SubscriptionCard subscription={subscription} />

        <form action={signOut} className="mt-8">
          <input type="hidden" name="locale" value={locale} />
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-md bg-cream-deep px-4 py-2 text-sm font-semibold text-cream-ink hover:bg-cream"
          >
            {t("signOut")}
          </button>
        </form>
      </main>
    </div>
  );
}
