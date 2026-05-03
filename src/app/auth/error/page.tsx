import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Lien invalide ou expiré · DeutschFit",
  robots: { index: false, follow: false },
};

// Anything outside this allow-list is considered "untrusted reason text" from
// Supabase or a bad query param — we render a generic message instead.
const KNOWN_REASONS: Record<string, string> = {
  missing_params: "Le lien est incomplet. Demandez un nouvel email de confirmation.",
  server_misconfigured:
    "Le service de confirmation est temporairement indisponible. Réessayez plus tard.",
};

const GENERIC_REASON = "Le lien est invalide ou a expiré. Demandez un nouvel email.";

// Strip any character that isn't a printable ASCII or common French letter.
// Defends against XSS / rendering of weird control bytes if Supabase ever
// passes back a raw provider message.
function sanitize(reason: string): string {
  // Limit length first (defence-in-depth — no infinite strings rendered).
  const clipped = reason.slice(0, 200);
  // Allow letters (incl. accented), digits, spaces, and a small set of punctuation.
  return clipped.replace(/[^\p{L}\p{N}\s.,:;!?'\-_/()]/gu, "");
}

type Props = {
  searchParams: Promise<{ reason?: string }>;
};

export default async function AuthErrorPage({ searchParams }: Props) {
  const { reason } = await searchParams;
  const safeReason = typeof reason === "string" ? reason : undefined;
  const known = safeReason ? KNOWN_REASONS[safeReason] : undefined;
  const detail = known ?? (safeReason ? sanitize(safeReason) : "");

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-md text-center">
        <h1 className="font-display text-[34px] leading-[1.15] tracking-tight text-text-primary">
          Lien invalide ou expiré
        </h1>
        <p className="mt-4 font-sans text-[16px] leading-[1.5] text-text-secondary">
          {detail || GENERIC_REASON}
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex items-center justify-center rounded-md bg-cream-deep px-5 py-2.5 font-sans text-[16px] font-semibold text-cream-ink hover:bg-cream"
        >
          Retour à l&apos;accueil
        </Link>
      </div>
    </main>
  );
}
