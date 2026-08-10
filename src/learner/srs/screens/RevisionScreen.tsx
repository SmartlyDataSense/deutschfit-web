"use client";

/**
 * SRS revision screen (S10 Task 4) — port of mobile
 * `src/features/srs/screens/RevisionScreen.tsx`. 100% local: reads the
 * due-queue via `useDueCards` (Dexie `srsCards`, no network) and hands
 * the first due card off to `SRSClozeCard` + `SRSProgressFooter`
 * (Task 3 blocks). Reveal navigates to the per-card reveal route rather
 * than mutating state here — grading/rating happens on that screen.
 *
 * D3 (StrictMode discipline): no screen-level focus/mount-refresh effect.
 * `useDueCards`'s own mount effect already re-runs on
 * (`limit`, `deck`, `now`) changes and is StrictMode-safe (the
 * `cancelled` flag is declared inside the effect body and set only in
 * cleanup) — an extra effect here would just be a redundant re-query.
 */
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";

import { useDueCards } from "@/learner/srs/hooks/useDueCards";
import { SRSClozeCard } from "@/learner/ui/blocks/SRSClozeCard";
import { SRSProgressFooter } from "@/learner/ui/blocks/SRSProgressFooter";
import { AppButton, AppText, EmptyState, Skeleton } from "@/learner/ui/primitives";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysOverdue(nextDue: Date, now: Date): number {
  const diff = now.getTime() - nextDue.getTime();
  if (diff <= 0) return 0;
  return Math.max(1, Math.round(diff / MS_PER_DAY));
}

export function RevisionScreen() {
  const { t } = useTranslation(["srs"]);
  const router = useRouter();
  const locale = useLocale();
  const { cards, loading, error } = useDueCards({ limit: 20 });
  const currentCard = cards[0] ?? null;
  const total = cards.length;

  const title = t("srs:revision.title");

  if (loading) {
    return (
      <div
        className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-4 px-4 py-8 lg:px-8"
        data-testid="srs-revision-screen"
      >
        <Skeleton.Block width="50%" height={28} aria-label={title} />
        <Skeleton.Card aria-label={title} />
        <Skeleton.Block width="100%" height={12} aria-label={title} />
      </div>
    );
  }

  const overdue = currentCard ? daysOverdue(currentCard.nextDue, new Date()) : 0;
  const dueLabel =
    overdue > 0 ? t("srs:due.overdueDays", { count: overdue }) : t("srs:due.dueToday");
  const instructionLabel =
    currentCard?.prompt.kind === "vocab"
      ? t("srs:revision.instructionVocab")
      : t("srs:revision.instructionCloze");

  const handleReveal = (): void => {
    if (!currentCard) return;
    router.push(`/${locale}/app/srs/reveal/${currentCard.id}`);
  };

  function renderClozeSentence(): ReactNode {
    if (!currentCard) return null;
    if (currentCard.prompt.kind === "vocab") {
      return currentCard.prompt.headword;
    }
    return (
      <>
        {currentCard.prompt.before} <span className="text-coach">{"  ____  "}</span>{" "}
        {currentCard.prompt.after}
      </>
    );
  }

  return (
    <div
      className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-4 px-4 py-8 lg:px-8"
      data-testid="srs-revision-screen"
    >
      <div>
        <AppText as="h1" family="serif" size="h1" weight="bold">
          {title}
        </AppText>
        <AppText tone="secondary" size="body" className="mt-1">
          {t("srs:revision.subtitle")}
        </AppText>
      </div>

      {error ? (
        <EmptyState
          testID="srs-revision-error"
          title={t("srs:revision.errorTitle")}
          description={t("srs:revision.errorBody")}
        />
      ) : !currentCard ? (
        <EmptyState
          testID="srs-revision-empty"
          title={t("srs:revision.emptyTitle")}
          description={t("srs:revision.emptyBody")}
        />
      ) : (
        <>
          <SRSClozeCard
            testID="srs-revision-card"
            dueLabel={dueLabel}
            subjectLabel={currentCard.prompt.subjectLabel}
            clozeSentence={renderClozeSentence()}
            translation={currentCard.prompt.translation}
            instructionLabel={instructionLabel}
          />
          <AppButton
            label={t("srs:revision.revealLabel")}
            onClick={handleReveal}
            variant="solid"
            testID="srs-revision-reveal"
            aria-label={t("srs:revision.revealA11y")}
          />
          <SRSProgressFooter
            testID="srs-revision-footer"
            currentIndex={1}
            total={total}
            positionLabel={t("srs:revision.positionLabel", {
              current: 1,
              total,
            })}
            remainingLabel={`${total} ${t("srs:revision.remainingLabel")}`}
          />
        </>
      )}
    </div>
  );
}
