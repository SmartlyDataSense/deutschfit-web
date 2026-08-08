"use client";

import { useTranslation } from "react-i18next";

import { AppText, EmptyState } from "@/learner/ui/primitives";

/**
 * Coach (Betreuer tab) placeholder — see `apprendre/page.tsx` for the
 * rationale on `"use client"` + why this only wires the nav shell.
 */
export default function CoachPage() {
  const { t } = useTranslation(["coach", "common"]);

  return (
    <div className="flex flex-col gap-6 px-4 py-10 md:px-8">
      <AppText as="h1" size="h1" weight="bold" family="serif">
        {t("coach:home.title")}
      </AppText>
      <EmptyState
        testID="coach-empty-state"
        title={t("common:empty.genericTitle")}
        description={t("common:empty.genericBody")}
      />
    </div>
  );
}
