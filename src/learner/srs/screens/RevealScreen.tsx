"use client";

/**
 * SRS reveal screen (S10 Task 5) — port of mobile
 * `src/features/srs/screens/RevealScreen.tsx`. 100% local: resolves the
 * card from the due-queue (`useDueCards`, Dexie `srsCards`) and persists
 * the self-rating via `useSubmitReview` (Dexie `srsReviews` + `srsCards`
 * update, no network).
 *
 * S10-D2 (web deviation from mobile): a card that has fallen out of the
 * due queue between navigation and render (e.g. deep link to a
 * future-due card, or a race with another tab rating it away) renders an
 * explicit "missing" state with a manual back CTA instead of mobile's
 * silent-redirect. SM-2 discipline — `useDueCards` is the single source
 * of truth for "is this card actually due"; the reveal screen never
 * second-guesses it.
 *
 * StrictMode discipline: the one-shot default-selection effect assigns
 * inside the effect body (`setSelectedId((prev) => prev ?? ...)`) so a
 * double-invoke in dev is idempotent — no cleanup-only mounted-ref, no
 * persistent one-shot boot ref (web#38 precedent).
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";

import { useDueCards } from "@/learner/srs/hooks/useDueCards";
import { useSubmitReview } from "@/learner/srs/hooks/useSubmitReview";
import { DifficultyActionRow, type Difficulty } from "@/learner/ui/blocks/DifficultyActionRow";
import { SRSExplanationPanel } from "@/learner/ui/blocks/SRSExplanationPanel";
import { SRSOptionChipRow } from "@/learner/ui/blocks/SRSOptionChipRow";
import { AppButton, AppText, EmptyState, Skeleton } from "@/learner/ui/primitives";

export interface RevealScreenProps {
  readonly cardId: string;
}

export function RevealScreen({ cardId }: RevealScreenProps) {
  const { t } = useTranslation(["srs"]);
  const router = useRouter();
  const locale = useLocale();
  const { cards, loading, error } = useDueCards({ limit: 20 });
  const { submit, submitting } = useSubmitReview();

  const card = cards.find((c) => c.id === cardId);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);

  // One-shot default selection once the card arrives (query is async on
  // web, so mobile's useState initializer becomes an effect; assigned
  // INSIDE the effect body per StrictMode discipline).
  useEffect(() => {
    if (!card) return;
    setSelectedId((prev) => prev ?? card.answer.options.find((o) => o.isCorrect)?.id);
  }, [card]);

  const handleRate = async (value: Difficulty): Promise<void> => {
    if (!card || submitting) return;
    try {
      await submit({ cardId: card.id, rating: value });
      router.replace(`/${locale}/app/srs`);
    } catch {
      // useSubmitReview exposes `error`; buttons re-enable on failure
      // (mobile parity, no toast).
    }
  };

  if (loading) {
    return (
      <div
        className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-4 px-4 py-8 lg:px-8"
        data-testid="srs-reveal-screen"
      >
        <Skeleton.Block width="50%" height={28} aria-label={t("srs:reveal.title")} />
        <Skeleton.Card aria-label={t("srs:reveal.title")} />
        <Skeleton.Block width="100%" height={52} aria-label={t("srs:reveal.title")} />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-4 px-4 py-8 lg:px-8"
        data-testid="srs-reveal-screen"
      >
        <EmptyState
          testID="srs-reveal-error"
          title={t("srs:revision.errorTitle")}
          description={t("srs:revision.errorBody")}
        />
        <AppButton
          testID="srs-reveal-back"
          variant="outline"
          label={t("srs:reveal.backToRevision")}
          onClick={() => router.replace(`/${locale}/app/srs`)}
        />
      </div>
    );
  }

  if (!card) {
    return (
      <div
        className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-4 px-4 py-8 lg:px-8"
        data-testid="srs-reveal-screen"
      >
        <div data-testid="srs-reveal-missing" className="flex flex-col gap-2">
          <AppText as="h1" family="serif" size="h1" weight="bold">
            {t("srs:reveal.missingTitle")}
          </AppText>
          <AppText tone="secondary" size="body">
            {t("srs:reveal.missingBody")}
          </AppText>
        </div>
        <AppButton
          testID="srs-reveal-back"
          variant="outline"
          label={t("srs:reveal.backToRevision")}
          onClick={() => router.replace(`/${locale}/app/srs`)}
        />
      </div>
    );
  }

  const labels: Record<Difficulty, string> = {
    again: t("srs:difficulty.again"),
    hard: t("srs:difficulty.hard"),
    good: t("srs:difficulty.good"),
    easy: t("srs:difficulty.easy"),
  };
  const icons: Record<Difficulty, string> = {
    again: t("srs:difficulty.againIcon"),
    hard: t("srs:difficulty.hardIcon"),
    good: t("srs:difficulty.goodIcon"),
    easy: t("srs:difficulty.easyIcon"),
  };
  const durations: Record<Difficulty, string> = {
    again: t("srs:difficulty.againDuration"),
    hard: t("srs:difficulty.hardDuration"),
    good: t("srs:difficulty.goodDuration"),
    easy: t("srs:difficulty.easyDuration"),
  };

  return (
    <div
      className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-4 px-4 py-8 lg:px-8"
      data-testid="srs-reveal-screen"
    >
      <div>
        <AppText
          tone="coach"
          size="caption"
          weight="semi"
          className="uppercase tracking-[var(--tracking-wide)]"
        >
          {card.prompt.subjectLabel}
        </AppText>
        <AppText as="h1" family="serif" size="h1" weight="bold">
          {t("srs:reveal.title")}
        </AppText>
      </div>

      <SRSOptionChipRow
        testID="srs-reveal-options"
        options={card.answer.options}
        selectedId={selectedId}
        revealed
        onSelect={setSelectedId}
      />

      <SRSExplanationPanel
        testID="srs-reveal-explanation"
        body={card.prompt.explanation}
        overlineLabel={t("srs:reveal.explanationOverline")}
      />

      <DifficultyActionRow
        testID="srs-reveal-difficulty"
        disabled={submitting}
        labels={labels}
        icons={icons}
        durations={durations}
        onSelect={(v) => void handleRate(v)}
      />
    </div>
  );
}
