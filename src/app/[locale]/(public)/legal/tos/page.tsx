import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LegalShell } from "@/components/public/LegalShell";

type Props = { params: Promise<{ locale: string }> };

/**
 * Terms of Service. Body content ported verbatim from
 * deutschfit-legal/tos.html so the legal substance does not drift between the
 * GitHub-Pages predecessor and this Next.js surface.
 */
export default async function TosPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("legal.tos");

  return (
    <LegalShell title={t("title")} effective="2026-04-26" version="1.0.1 (beta)">
      <h2>1. Acceptance</h2>
      <p>
        By downloading or using DeutschFit, you agree to these Terms. If you do not agree, do not
        use the app.
      </p>

      <h2>2. The service</h2>
      <p>
        DeutschFit is a mobile app that helps you prepare for German-language certification exams
        (Goethe, TELC, ÖSD, TestDaF, ECL, and certification routes in Pflege and Beruf Tourismus).
        The app is currently in beta.
      </p>

      <h2>3. Your account</h2>
      <p>
        You need an account to use graded features. You are responsible for keeping your credentials
        confidential.
      </p>

      <h2>4. Beta status</h2>
      <p>
        This is a beta release. Features may change or disappear between builds. We recommend not
        relying solely on DeutschFit for any time-critical exam preparation. Always consult the
        official guidelines from your exam body (Goethe-Institut, telc, ÖSD, TestDaF, ECL, etc.).
      </p>

      <h2>5. AI-generated content</h2>
      <p>
        Feedback on Schreiben and Sprechen is produced by an AI model (OpenAI). It is designed to
        mirror official rubrics but can be wrong. It is not a substitute for human feedback from a
        qualified teacher, and it does not guarantee any exam result.
      </p>

      <h2>6. Acceptable use</h2>
      <p>
        You agree not to: (a) attempt to reverse-engineer the app or its AI prompts; (b) use the app
        to harass, defraud, or cheat any third party or exam board; (c) submit content that is
        unlawful, hateful, or infringes others&rsquo; rights.
      </p>

      <h2>7. Subscriptions</h2>
      <p>
        The app itself is free during beta. Any paid subscription, when offered, is sold and managed
        exclusively on our website. Subscription terms (price, billing frequency, renewal,
        cancellation, right of withdrawal) are presented at checkout on the website before any
        charge. Subscriptions are not sold inside the mobile app.
      </p>

      <h2>8. Termination</h2>
      <p>You can delete your account at any time, in one click:</p>
      <ul>
        <li>
          In the mobile app: <em>Settings → Danger Zone → Delete account</em>.
        </li>
        <li>
          On the website:{" "}
          <em>
            <Link href={{ pathname: "/account", hash: "delete" }}>
              deutschfit.app/account → Delete account
            </Link>
          </em>
          .
        </li>
      </ul>
      <p>
        Both paths erase your account and your associated data immediately. You can also email{" "}
        <a href="mailto:support@deutschfit.app">support@deutschfit.app</a> if you cannot access
        either surface — we will process the request within 30 days. We may suspend accounts that
        violate these Terms.
      </p>

      <h2>9. Liability</h2>
      <p>
        DeutschFit is provided &ldquo;as is&rdquo; during beta. To the maximum extent permitted by
        law, we are not liable for any loss arising from use of the app, including but not limited
        to exam outcomes.
      </p>

      <h2>10. Governing law</h2>
      <p>
        These Terms are governed by the laws of the Republic of Cameroon. Any dispute that cannot be
        settled amicably will be brought before the competent courts of Douala, Cameroon, unless
        mandatory consumer-protection law in your country of residence grants you the right to seize
        a different court.
      </p>

      <h2>11. Contact</h2>
      <p>
        <a href="mailto:support@deutschfit.app">support@deutschfit.app</a>
      </p>
    </LegalShell>
  );
}
