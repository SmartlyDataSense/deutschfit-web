import { setRequestLocale, getTranslations } from "next-intl/server";
import { LegalShell } from "@/components/public/LegalShell";

type Props = { params: Promise<{ locale: string }> };

/**
 * Privacy Policy. Body content is ported verbatim from
 * deutschfit-legal/privacy.html (the GitHub-Pages predecessor) so the legal
 * substance does not drift while we move the surface. The shell, typography,
 * and "Effective date / Version" header are owned by `LegalShell`.
 */
export default async function PrivacyPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("legal.privacy");

  return (
    <LegalShell title={t("title")} effective="2026-04-22" version="1.0.0 (beta)">
      <h2>1. Who we are</h2>
      <p>
        DeutschFit (the &ldquo;app&rdquo;) is operated by Jordan Moyo (a natural person), working
        under the unregistered trade names DeutschFit and SmartlyDataSense. The data controller is:
      </p>
      <p>
        Jordan Moyo
        <br />
        Douala, Cameroon
        <br />
        Email: <a href="mailto:support@deutschfit.app">support@deutschfit.app</a>
      </p>
      <p>
        Although the data controller is established outside the EU, this policy is written to comply
        with the EU General Data Protection Regulation (GDPR), which applies extraterritorially
        under Article 3(2) because the service is offered to data subjects in the EU.
      </p>

      <h2>2. What we collect</h2>
      <ul>
        <li>
          <strong>Account data:</strong> email address (for sign-in), a hashed password (dev/preview
          only) or one-time code (production).
        </li>
        <li>
          <strong>Exam preferences:</strong> chosen exam board (Goethe / TELC / ÖSD / TestDaF / ECL
          / Pflege / Beruf Tourismus) and CEFR level (A1-C2).
        </li>
        <li>
          <strong>Learning activity:</strong> exercise attempts, scores, time on task, and progress
          per CEFR competence (Lesen, Hören, Schreiben, Sprechen, Grammar, Landeskunde).
        </li>
        <li>
          <strong>Graded work:</strong> your Schreiben text submissions and Sprechen audio
          recordings, used to produce feedback.
        </li>
        <li>
          <strong>Device diagnostics:</strong> crash reports and anonymous performance metrics (via
          Expo / Sentry) to improve stability.
        </li>
      </ul>

      <h2>3. How we use it</h2>
      <ul>
        <li>
          To provide AI-generated feedback on your writing and speaking (via OpenAI, our sole AI
          provider for v1.0).
        </li>
        <li>To track your progress and personalise the Coach weekly plan.</li>
        <li>To fix bugs and improve the app.</li>
        <li>To communicate with you about the service (account, support).</li>
      </ul>

      <h2>4. AI processing</h2>
      <p>
        Your Schreiben text submissions and Sprechen audio recordings are sent to{" "}
        <a href="https://openai.com/policies/privacy-policy" rel="noopener" target="_blank">
          OpenAI
        </a>{" "}
        for grading. OpenAI does not use your data to train its models (as per the API data-usage
        policy). We do not send your identity to OpenAI — submissions are keyed by an opaque ID.
      </p>

      <h2>5. Data storage</h2>
      <p>
        Account and learning data live in Supabase (Postgres + Storage) hosted in the EU. Audio
        files are stored encrypted at rest.
      </p>

      <h2>6. Data retention</h2>
      <ul>
        <li>Graded submissions: retained while your account is active.</li>
        <li>Raw audio recordings: deleted 90 days after grading.</li>
        <li>Account data: deleted within 30 days of account deletion request.</li>
      </ul>

      <h2>7. Your rights (GDPR)</h2>
      <p>
        You can request access to, correction of, or deletion of your data at any time by emailing{" "}
        <a href="mailto:support@deutschfit.app">support@deutschfit.app</a>. You also have the right
        to lodge a complaint with your local data-protection authority (e.g. the BfDI in Germany,
        the CNIL in France).
      </p>

      <h2>8. Sharing</h2>
      <p>
        We do not sell your data. We share data only with the processors listed above (Supabase,
        OpenAI, Expo) strictly to run the service.
      </p>

      <h2>9. Children</h2>
      <p>
        DeutschFit is not directed at children under 13. If you believe a child under 13 has
        provided us with personal data, contact us and we will delete it.
      </p>

      <h2>10. Changes</h2>
      <p>
        We will post any changes to this policy here and bump the version number. Material changes
        will be notified in-app.
      </p>
    </LegalShell>
  );
}
