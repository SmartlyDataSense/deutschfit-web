import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Compte confirmé · DeutschFit",
  // Auth-bridge pages are transactional, not crawlable surface area.
  robots: { index: false, follow: false },
};

const APP_LINK = "deutschfit://auth/callback?status=ok";

// Mirrors the `type` query param Supabase appends to the email link. We map
// each one to the heading that best describes what the user just completed.
const HEADINGS: Record<string, string> = {
  email: "Email confirmé",
  signup: "Compte confirmé",
  invite: "Invitation acceptée",
  email_change: "Nouvel email confirmé",
  magiclink: "Connexion confirmée",
};

const BODIES: Record<string, string> = {
  email: "Votre adresse email est vérifiée. Vous pouvez maintenant ouvrir DeutschFit.",
  signup: "Votre compte est prêt. Ouvrez DeutschFit pour commencer.",
  invite: "Invitation acceptée. Ouvrez DeutschFit pour terminer la configuration.",
  email_change: "Votre nouvelle adresse email est vérifiée. Ouvrez DeutschFit pour continuer.",
  magiclink: "Connexion réussie. Ouvrez DeutschFit pour reprendre votre session.",
};

const DEFAULT_HEADING = "Compte confirmé";
const DEFAULT_BODY = "Vous pouvez maintenant ouvrir DeutschFit.";

type Props = {
  // Next.js 15 typed routes — searchParams is a Promise in the app router.
  searchParams: Promise<{ type?: string }>;
};

export default async function ConfirmedPage({ searchParams }: Props) {
  const { type } = await searchParams;
  const safeType = typeof type === "string" ? type : undefined;
  const heading = (safeType && HEADINGS[safeType]) ?? DEFAULT_HEADING;
  const body = (safeType && BODIES[safeType]) ?? DEFAULT_BODY;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-md text-center">
        <h1 className="font-display text-[34px] leading-[1.15] tracking-tight text-text-primary">
          {heading}
        </h1>
        <p className="mt-4 font-sans text-[16px] leading-[1.5] text-text-secondary">{body}</p>
        <a
          href={APP_LINK}
          className="mt-8 inline-flex items-center justify-center rounded-md bg-cta px-5 py-2.5 font-sans text-[16px] font-semibold text-cta-ink hover:opacity-90"
        >
          Ouvrir DeutschFit
        </a>
        <p className="mt-6 font-sans text-[12px] leading-[1.4] text-text-tertiary">
          Si l&apos;application ne s&apos;ouvre pas automatiquement, installez DeutschFit puis
          relancez ce lien.
        </p>
      </div>
    </main>
  );
}
