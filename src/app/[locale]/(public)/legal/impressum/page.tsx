import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LegalShell } from "@/components/public/LegalShell";

type Props = { params: Promise<{ locale: string }> };

/**
 * Impressum / Mentions légales. Ported verbatim from
 * deutschfit-legal/impressum.html. Cross-references to /legal/privacy use the
 * locale-aware Link from `@/i18n/navigation` rather than raw <a href> so the
 * locale prefix is preserved.
 */
export default async function ImpressumPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("legal.impressum");

  return (
    <LegalShell title={t("title")} effective="2026-04-25">
      <h2>Operator (Anbieter / Éditeur)</h2>
      <p>DeutschFit is operated by:</p>
      <p>
        Jordan Moyo (natural person)
        <br />
        Douala, Cameroon
        <br />
        Email: <a href="mailto:support@deutschfit.app">support@deutschfit.app</a>
      </p>
      <p>
        DeutschFit and SmartlyDataSense are unregistered trade names used by the operator. There is
        no registered company behind these names at this time.
      </p>

      <h2>Purpose of this page</h2>
      <p>
        This page satisfies the operator-disclosure requirements that may apply to users in
        different jurisdictions:
      </p>
      <ul>
        <li>Germany — § 5 Telemediengesetz (TMG): Impressumspflicht.</li>
        <li>France — Article 6 III de la LCEN: mentions légales.</li>
        <li>Austria — § 5 ECG.</li>
        <li>
          EU GDPR Article 13 — identity and contact details of the controller (see also our{" "}
          <Link href="/legal/privacy">Privacy Policy</Link>).
        </li>
      </ul>

      <h2>Hosting</h2>
      <p>
        The marketing pages and legal documents are served by Vercel Inc. (340 S Lemon Ave #4133,
        Walnut, CA 91789, USA). Application data is stored by Supabase, Inc. on EU-region
        infrastructure — see the <Link href="/legal/privacy">Privacy Policy</Link> for details.
      </p>

      <h2>Content responsibility (verantwortlich für den Inhalt)</h2>
      <p>
        Jordan Moyo, contact details above, is the person responsible for the editorial content of
        this site within the meaning of § 18 Abs. 2 MStV.
      </p>

      <h2>Liability disclaimer</h2>
      <p>
        The operator takes reasonable care to keep the information on this site accurate and up to
        date but accepts no liability for the accuracy, completeness, or current relevance of any
        content. External links are checked at the time of linking; the operator is not responsible
        for the content of external sites.
      </p>

      <h2>Subscriptions and payments</h2>
      <p>
        Paid subscriptions, when offered, are not sold inside the mobile app. They are sold and
        managed on the operator&rsquo;s website, where the seller identity (this page), the price
        including all applicable taxes, the billing frequency, the cancellation procedure, and any
        applicable right of withdrawal are disclosed before checkout.
      </p>

      <h2>EU-consumer right of withdrawal</h2>
      <p>
        Consumers resident in the EU may have a 14-day right of withdrawal for digital subscriptions
        under EU consumer-protection law. At the moment of paid checkout, EU consumers will be asked
        to expressly waive this right in order to receive immediate access to the digital service.
        Without that waiver, refund within 14 days remains available subject to the same EU rules.
      </p>

      <h2>Dispute resolution</h2>
      <p>
        The European Commission provides an online dispute-resolution platform at{" "}
        <a href="https://ec.europa.eu/consumers/odr" rel="noopener" target="_blank">
          https://ec.europa.eu/consumers/odr
        </a>
        . The operator is not obliged to and does not currently participate in dispute-resolution
        proceedings before a consumer arbitration board.
      </p>
    </LegalShell>
  );
}
