import { setRequestLocale, getTranslations } from "next-intl/server";
import { LegalShell } from "@/components/public/LegalShell";

type Props = { params: Promise<{ locale: string }> };

/**
 * About page. Body content ported verbatim from deutschfit-legal/about.html.
 */
export default async function AboutPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("legal.about");

  return (
    <LegalShell title={t("title")}>
      <p>
        DeutschFit is a mobile app that helps learners prepare for German-language certification
        exams end-to-end: Lesen, Hören, Schreiben, Sprechen, plus grammar and Landeskunde.
      </p>

      <h2>Exams covered</h2>
      <ul>
        <li>Goethe-Zertifikat (A1-C2)</li>
        <li>telc Deutsch (A1-C2)</li>
        <li>ÖSD Zertifikat (A1-C2)</li>
        <li>TestDaF (B2-C1)</li>
        <li>ECL (A2-C1)</li>
        <li>Pflege &amp; Beruf Tourismus routes</li>
      </ul>

      <h2>How it works</h2>
      <ol>
        <li>Pick your exam board and CEFR level during onboarding.</li>
        <li>Practise daily with exercises aligned to the official rubrics.</li>
        <li>
          Get instant AI-graded feedback on Schreiben and Sprechen — with missing-structure chips
          that link back to the exact grammar concept you need.
        </li>
        <li>Run a full mock exam anytime to check readiness against the real cut-off.</li>
      </ol>

      <h2>Team</h2>
      <p>
        DeutschFit is built and operated by Jordan Moyo, working under the unregistered trade names
        DeutschFit and SmartlyDataSense.
      </p>

      <h2>Version</h2>
      <p>v1.0.0 beta — 2026-04-22.</p>

      <h2>Contact</h2>
      <p>
        <a href="mailto:lordmoyojordan@gmail.com">lordmoyojordan@gmail.com</a>
      </p>
    </LegalShell>
  );
}
