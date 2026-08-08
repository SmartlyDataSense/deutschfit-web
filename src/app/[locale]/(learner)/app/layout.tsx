import { setRequestLocale } from "next-intl/server";

import { LearnerProviders } from "@/learner/core/LearnerProviders";

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

/**
 * Top-level learner segment shell — server component. Locks the locale
 * (so nested RSC pages/metadata read the right messages, mirroring the
 * `(admin)/admin` layout) and mounts `LearnerProviders` (i18n + session
 * bootstrap). Auth gating itself lives one level down, in
 * `(protected)/layout.tsx` — `/app/login` and `/app/dev/gallery` are
 * siblings of `(protected)` and must stay reachable without a session.
 */
export default async function LearnerLayout({ children, params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="min-h-screen bg-cream font-sans">
      <LearnerProviders>{children}</LearnerProviders>
    </div>
  );
}
