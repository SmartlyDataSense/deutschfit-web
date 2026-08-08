"use client";

import { useTranslation } from "react-i18next";

import { AppText, EmptyState } from "@/learner/ui/primitives";

/**
 * Apprendre (Pratique tab) placeholder — Task 1.3 wires the nav shell
 * only; the real skill hub (Schreiben/Sprechen/Lesen/Hören picker) lands
 * in a later S1 slice. `"use client"` because `useTranslation` needs the
 * `LearnerI18nProvider` context (mounted by the parent
 * `(learner)/app/layout.tsx`) — matches the rest of `(protected)`, which
 * is client-only per `LearnerGuard`'s locked architecture (no server-side
 * data fetching under this segment).
 */
export default function ApprendrePage() {
  const { t } = useTranslation(["apprendre", "common"]);

  return (
    <div className="flex flex-col gap-6 px-4 py-10 md:px-8">
      <AppText as="h1" size="h1" weight="bold" family="serif">
        {t("apprendre:title")}
      </AppText>
      <EmptyState
        testID="apprendre-empty-state"
        title={t("common:empty.genericTitle")}
        description={t("common:empty.genericBody")}
      />
    </div>
  );
}
