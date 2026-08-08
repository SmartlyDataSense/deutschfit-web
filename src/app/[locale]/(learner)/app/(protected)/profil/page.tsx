"use client";

import { useTranslation } from "react-i18next";

import { AppText, EmptyState } from "@/learner/ui/primitives";

/**
 * Profil tab placeholder — see `apprendre/page.tsx` for the rationale on
 * `"use client"` + why this only wires the nav shell. Sign-out itself
 * lives in `Sidebar`/desktop today (Task 1.3 scope); a mobile-reachable
 * sign-out affordance on this screen is a later slice's job.
 */
export default function ProfilPage() {
  const { t } = useTranslation(["profil", "common"]);

  return (
    <div className="flex flex-col gap-6 px-4 py-10 md:px-8">
      <AppText as="h1" size="h1" weight="bold" family="serif">
        {t("profil:title")}
      </AppText>
      <EmptyState
        testID="profil-empty-state"
        title={t("common:empty.genericTitle")}
        description={t("common:empty.genericBody")}
      />
    </div>
  );
}
