"use client";

/**
 * Shared untimed practice session screen (§6.6, Task 4.7) for Lesen and
 * Sprachbausteine — Hören keeps its existing screen. Web port of
 * `deutschfit-mobile/src/features/practice/screens/PracticeSessionScreen.tsx`.
 * Deliberately NO timer, NO «Quitter» confirm (free back-nav — locks
 * persist via `practice_progress`), NO Hören/Schreiben import (feature
 * isolation).
 *
 * Teil chip selector (`role="group"`), gold progress track (locked/total),
 * instructions block, then per-part body: cloze formats route through
 * `ClozePartView` (first reading text is the cloze body); everything else
 * renders reading-text cards + `ItemListPartView`. Footer: restart button
 * (only when the active part has any locks) + prev/next. `complete` →
 * `PracticeRecap`.
 *
 * `modality`/`slug` arrive as props (not read via `useSearchParams` here)
 * so this screen stays a plain, directly-testable component — the route
 * page owns the `useSearchParams` + `Suspense` boundary, same split as
 * `PracticeSetPickerScreen`/its route page.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useTranslation } from "react-i18next";

import { AppButton, AppText, Card, Chip, EmptyState, Skeleton } from "@/learner/ui/primitives";

import { ClozePartView } from "../components/ClozePartView";
import { ItemListPartView } from "../components/ItemListPartView";
import { PracticeRecap } from "../components/PracticeRecap";
import { usePracticeSession } from "../hooks/usePracticeSession";
import type { ReadingTextInfo } from "../hooks/usePracticeSession";
import { partProgress } from "../model/lockState";
import type { TextPracticeModality } from "../model/types";

export interface PracticeSessionScreenProps {
  readonly modality: TextPracticeModality;
  readonly slug?: string;
}

const CLOZE_FORMATS = new Set(["CLOZE_RADIO", "CLOZE_DRAG"]);

// Explicit map — no template-literal t() keys (the i18n linter and
// i18next-parser cannot see dynamic keys).
const TITLE_KEY: Record<TextPracticeModality, string> = {
  lesen: "apprendre:practice.rows.lesen",
  sprachbausteine: "apprendre:practice.rows.sprachbausteine",
};

const CONTAINER_CLASS = "mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8 lg:px-8";

export function PracticeSessionScreen({ modality, slug }: PracticeSessionScreenProps) {
  const { t } = useTranslation(["apprendre"]);
  const router = useRouter();
  const locale = useLocale();
  const { state, pick, restartPart, reload } = usePracticeSession(modality, slug);
  const [teilIndex, setTeilIndex] = useState(0);

  const goBackToHub = (): void => {
    router.push(`/${locale}/app/apprendre/practice`);
  };

  if (state.status === "loading") {
    return (
      <div className={CONTAINER_CLASS} data-testid="practice-session-loading">
        <Skeleton.Card />
        <Skeleton.Card />
        <Skeleton.Text />
      </div>
    );
  }

  if (state.status === "unsupported") {
    return (
      <div className={CONTAINER_CLASS}>
        <EmptyState
          testID="practice-session-unsupported"
          title={t("apprendre:practice.unsupported")}
        />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className={CONTAINER_CLASS} data-testid="practice-session-error">
        <EmptyState title={t("apprendre:practice.session.errorTitle")} />
        <button
          type="button"
          data-testid="practice-session-error-retry"
          onClick={reload}
          className="min-h-11 self-start rounded-[var(--radius-full)] bg-bg-card px-6 py-2 transition hover:opacity-90"
        >
          <AppText tone="primary" size="body" weight="semi">
            {t("apprendre:practice.session.retry")}
          </AppText>
        </button>
      </div>
    );
  }

  const parts = state.session.parts;

  if (state.complete) {
    return (
      <div className={CONTAINER_CLASS}>
        <PracticeRecap
          parts={parts}
          locks={state.locks}
          title={t("apprendre:practice.session.recapTitle")}
          scoreLabel={(correct, total) =>
            t("apprendre:practice.session.recapScore", { correct, total })
          }
          restartLabel={t("apprendre:practice.session.restart")}
          backLabel={t("apprendre:practice.session.backToHub")}
          onRestartPart={(part) => {
            restartPart(part);
            const index = parts.findIndex((p) => p.id === part.id);
            setTeilIndex(index >= 0 ? index : 0);
          }}
          onBackToHub={goBackToHub}
        />
      </div>
    );
  }

  const currentPart = parts[teilIndex] ?? parts[0];
  if (!currentPart) {
    return null;
  }

  const progress = partProgress(state.locks, currentPart);
  const fillPct = progress.total ? (progress.locked / progress.total) * 100 : 0;
  const isCloze = CLOZE_FORMATS.has(currentPart.items[0]?.answerFormat ?? "");
  const slugs = [
    ...new Set(
      currentPart.items.map((item) => item.stimulusSlug).filter((s): s is string => s !== null)
    ),
  ];
  const texts = slugs
    .map((s) => state.readingTexts[s])
    .filter((text): text is ReadingTextInfo => text !== undefined);
  const clozeBody = texts[0]?.body ?? "";

  return (
    <div className={CONTAINER_CLASS} data-testid="practice-session-screen">
      <AppText as="h1" family="serif" size="h2" weight="bold" testID="practice-session-title">
        {t(TITLE_KEY[modality])}
      </AppText>

      <div
        role="group"
        aria-label={t("apprendre:practice.session.pickerTitle")}
        className="flex flex-wrap gap-2"
      >
        {parts.map((part, index) => (
          <Chip
            key={part.id}
            testID={`practice-teil-chip-${part.id}`}
            label={t("apprendre:practice.session.teilChip", { number: part.teilNumber })}
            selected={index === teilIndex}
            onClick={() => setTeilIndex(index)}
          />
        ))}
      </div>

      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line-soft">
          <div className="h-full rounded-full bg-accent-gold" style={{ width: `${fillPct}%` }} />
        </div>
        <AppText family="mono" size="caption" tone="secondary" testID="practice-session-progress">
          {t("apprendre:practice.session.progress", {
            locked: progress.locked,
            total: progress.total,
          })}
        </AppText>
      </div>

      <AppText tone="secondary" size="small">
        {currentPart.instructions}
      </AppText>

      {isCloze && clozeBody ? (
        <ClozePartView
          part={currentPart}
          readingText={clozeBody}
          locks={state.locks}
          pickerTitle={t("apprendre:practice.session.pickerTitle")}
          onPick={pick}
        />
      ) : (
        <>
          {texts.map((text) => (
            <Card key={text.label} className="flex flex-col gap-2">
              <AppText
                size="caption"
                weight="semi"
                tone="secondary"
                className="uppercase tracking-wide"
              >
                {text.label}
              </AppText>
              {text.body ? <AppText>{text.body}</AppText> : null}
            </Card>
          ))}
          <ItemListPartView part={currentPart} locks={state.locks} onPick={pick} />
        </>
      )}

      <div className="flex flex-col gap-2 border-t border-line-soft pt-4">
        {progress.locked > 0 ? (
          <button
            type="button"
            data-testid="practice-session-restart"
            onClick={() => restartPart(currentPart)}
            className="min-h-11 self-start"
          >
            <AppText tone="cta" size="small" weight="semi">
              {t("apprendre:practice.session.restart")}
            </AppText>
          </button>
        ) : null}
        <div className="flex gap-2">
          <AppButton
            testID="practice-session-prev"
            variant="outline"
            label={t("apprendre:practice.session.previous")}
            disabled={teilIndex === 0}
            onClick={() => setTeilIndex((index) => Math.max(0, index - 1))}
            className="flex-1"
          />
          <AppButton
            testID="practice-session-next"
            variant="solid"
            label={t("apprendre:practice.session.next")}
            disabled={teilIndex === parts.length - 1}
            onClick={() => setTeilIndex((index) => Math.min(parts.length - 1, index + 1))}
            className="flex-1"
          />
        </div>
      </div>
    </div>
  );
}
