import "../globals.css";

/**
 * Locale-agnostic shell for the email-confirmation bridge.
 *
 * `/auth/confirm` and its sister pages (`/auth/confirmed`, `/auth/error`) sit
 * outside the `[locale]` segment because the link comes from a transactional
 * email and doesn't carry user-locale context. The pages render in French
 * (DeutschFit's primary v1 audience) and stay short + self-contained.
 *
 * The root `app/layout.tsx` returns its children verbatim — without an
 * `<html>/<body>` shell — so we add one here.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
