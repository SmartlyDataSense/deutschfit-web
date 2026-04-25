import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LegalShell } from "@/components/public/LegalShell";

type Props = { params: Promise<{ locale: string }> };

/**
 * Refunds & cancellation. New text written for the web surface — no
 * predecessor in deutschfit-legal/. The substance is dictated by the payment
 * spec: 7-day discretionary refund window, EU consumers' 14-day right of
 * withdrawal, prorated formula, and the operator's exchange-rate disclaimer
 * for refunds via the original method (mobile money, OM, bank transfer,
 * PayPal, Wise).
 */
export default async function RefundPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("legal.refund");

  return (
    <LegalShell title={t("title")} effective="2026-04-25" version="1.0.0">
      <h2>1. Scope</h2>
      <p>
        This policy covers paid subscriptions and one-time purchases sold on this website. It does
        not apply to the free tier of the DeutschFit mobile app.
      </p>

      <h2>2. 7-day discretionary refund window</h2>
      <p>
        We offer a 7-day discretionary refund window from the date of the original charge. If you
        contact us within 7 days at{" "}
        <a href="mailto:lordmoyojordan@gmail.com">lordmoyojordan@gmail.com</a> we will refund the
        full amount of the affected billing period, less any third-party processing fees we cannot
        recover, provided you have not used the service heavily during that window. We reserve the
        right to decline refunds where there is evidence of abuse (e.g. repeat signup-and-refund
        cycles).
      </p>

      <h2>3. EU consumers — 14-day right of withdrawal</h2>
      <p>
        If you are a consumer resident in the European Union, you have a statutory right to withdraw
        from a distance contract for digital services within 14 days of the contract being
        concluded, under Directive 2011/83/EU as transposed into your national law. To exercise this
        right, send an unequivocal statement (e.g. an email to{" "}
        <a href="mailto:lordmoyojordan@gmail.com">lordmoyojordan@gmail.com</a>) before the 14-day
        period expires.
      </p>
      <p>
        At checkout, EU consumers are offered the option to expressly request immediate access to
        the digital service and acknowledge that doing so causes the right of withdrawal to lapse
        once we begin performance. Where this waiver is given, the 14-day right of withdrawal no
        longer applies; the 7-day discretionary window in §2 still does.
      </p>

      <h2>4. Cancellation</h2>
      <p>
        You can cancel a subscription at any time from the <Link href="/account">Account</Link>{" "}
        screen on this website, or by emailing{" "}
        <a href="mailto:lordmoyojordan@gmail.com">lordmoyojordan@gmail.com</a>. Cancellation takes
        effect at the end of the current billing period — you keep access until then. We do not
        pro-rate cancellations as a rule (see §5 for prorated refunds tied to a refund request).
      </p>

      <h2>5. Prorated refunds</h2>
      <p>
        Outside the 7-day window in §2 and the 14-day right in §3, we may at our discretion refund
        the unused portion of a paid month or year. The refunded amount is calculated as:
      </p>
      <p>
        <strong>refund = price paid × (days remaining / billing period)</strong> − non-recoverable
        third-party processing fees.
      </p>
      <p>Prorated refunds are issued at our discretion and are not a statutory right.</p>

      <h2>6. Refund method and exchange rate</h2>
      <p>
        Refunds are issued to the original payment method whenever possible (mobile money, Orange
        Money, bank transfer, PayPal, or Wise). If the original method is not available or not
        reachable on our side, we may offer an equivalent alternative method.
      </p>
      <p>
        Where the original currency differs from XAF, the refund amount in your local currency may
        differ slightly from the original charge because of exchange-rate movements and any spread
        applied by the payment provider. We refund the XAF amount actually received and do not
        compensate for FX-related differences.
      </p>

      <h2>7. Time to receive a refund</h2>
      <p>
        Once approved, refunds are typically issued within 5 business days. Depending on the payment
        method, the funds may take an additional 1-10 business days to appear in your account.
      </p>

      <h2>8. Disputes</h2>
      <p>
        If you disagree with a refund decision, contact us first at{" "}
        <a href="mailto:lordmoyojordan@gmail.com">lordmoyojordan@gmail.com</a> so we can try to
        resolve the dispute amicably. The dispute-resolution section of our{" "}
        <Link href="/legal/impressum">Impressum / Mentions légales</Link> explains the EU online
        dispute-resolution platform option for EU consumers.
      </p>

      <h2>9. Contact</h2>
      <p>
        <a href="mailto:lordmoyojordan@gmail.com">lordmoyojordan@gmail.com</a>
      </p>
    </LegalShell>
  );
}
