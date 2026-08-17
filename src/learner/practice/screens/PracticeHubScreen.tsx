"use client";

/**
 * Übungen hub (§6.5) — one untimed practice entry per module for the
 * learner's (board, level). Web port of
 * `deutschfit-mobile/src/features/practice/screens/PracticeHubScreen.tsx`.
 *
 * Chips (`lesen` + `sprachbausteine`) come exclusively from
 * `usePracticeHub` — Dexie `practice_progress` reads, zero network calls
 * (P12).
 *
 * `hoeren` (Task 5.5) is now an enabled row, same as `lesen`/
 * `sprachbausteine` — it routes to the same Übungstest picker
 * (`/apprendre/practice/hoeren`), which maps its own routing forward to
 * `/hoeren/session?slug=` (`PracticeSetPickerScreen`, spec §4 route map).
 * Its chip is hardcoded to `{ state: "todo" }` rather than derived from
 * `usePracticeHub` — Hören practice persists nothing to
 * `practice_progress` (P13), so there is no local record to ever flip it
 * to "done"/"in progress".
 *
 * The `lesen`/`sprachbausteine`/`hoeren` rows route to the Übungstest
 * picker (`/apprendre/practice/<modality>`, Task 4.6/4.7/5.5 — mobile
 * parity: rows are tappable) since that surface exists for all three.
 *
 * `schreiben` (Task 6.6) is now an enabled row too, but its destination
 * is NOT the Übungstest picker — Schreiben has no per-set picker, it has
 * a single prompt list. The row routes straight to
 * `/schreiben?board=<board>-<level>`, seeding `PromptListScreen`'s
 * one-shot `initialBoardFilter` with the learner's current exam track so
 * the list opens pre-filtered. Same as `hoeren`, its chip is hardcoded to
 * `{ state: "todo" }` — Schreiben submissions persist to
 * `writing_submissions`/`writing_drafts`, not `practice_progress`, so
 * there is no local record `usePracticeHub` could derive a chip from.
 *
 * `sprechen` (Task 7.6) is now an enabled row too, same shape as
 * `schreiben`/`hoeren`: no Übungstest picker, the row routes straight to
 * the topic picker (`/sprechen`), and its chip is hardcoded to
 * `{ state: "todo" }` — Sprechen submissions persist to
 * `sprechen_submissions`, not `practice_progress`.
 *
 * Progress chip tone: the `Chip` primitive (`@/learner/ui/primitives`)
 * has no per-instance tone — same constraint `StatusStrip` hit — so
 * the tone pill here is a small local composition over `AppText`'s tone
 * prop (`PILL_TONE_BG`/`PILL_TONE_TEXT`) instead of the tone-less `Chip`.
 *
 * Hydration guard (Task 4.7 fix round, adjudicated addition A): like
 * `usePracticeSets` (Task 4.6), `/apprendre/practice` is deep-linkable and
 * sits under `(protected)`, whose layout chain never calls
 * `hydrateExamContext()` — only individual screens do, each in its own
 * mount effect. Before this fix, a deep-link/refresh landed with the store
 * still at `isLoaded: false` and never transitioning — `usePracticeHub`
 * reads `board`/`level` straight off the store with no hydrate call of its
 * own, so the `!isExamContextLoaded` guard below would gate the render on
 * a flag nothing ever flips, showing the loading skeleton forever. This
 * screen now self-hydrates (same idiom as `AccueilScreen`/`usePracticeSets`)
 * so `isLoaded` reliably flips to `true` even with no ancestor hydrating it.
 */
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import clsx from "clsx";

import { hydrateExamContext, useExamContextStore } from "@/learner/core/exam/examContext";
import { Icon } from "@/learner/core/icons/Icon";
import type { IconName } from "@/learner/core/icons/iconSprite";
import { AppText, Card, EmptyState, Skeleton, type AppTextTone } from "@/learner/ui/primitives";

import { usePracticeHub } from "../hooks/usePracticeHub";
import type { PracticeChip } from "../model/progressChip";
import type { PracticeModality, TextPracticeModality } from "../model/types";

// Chip-backed rows only (`usePracticeHub` derives progress for these two);
// hoeren renders as its own hardcoded-chip row below (module doc comment).
const PRACTICE_MODALITIES: readonly TextPracticeModality[] = ["lesen", "sprachbausteine"];

// Explicit map — no template-literal t() keys (i18next-parser can't see dynamic keys).
const ROW_LABEL_KEY: Record<TextPracticeModality, string> = {
  lesen: "apprendre:practice.rows.lesen",
  sprachbausteine: "apprendre:practice.rows.sprachbausteine",
};

// Canonical sprite glyphs only — never invent icons.
const ROW_ICON: Record<TextPracticeModality, IconName> = {
  lesen: "lesen",
  sprachbausteine: "target-focus",
};

const PILL_TONE_BG: Record<PracticeChip["state"], string> = {
  done: "bg-success-subtle",
  inProgress: "bg-accent-gold/15",
  todo: "bg-bg-subtle",
};

const PILL_TONE_TEXT: Record<PracticeChip["state"], AppTextTone> = {
  done: "success",
  inProgress: "gold",
  todo: "secondary",
};

function ChipPill({ chip, label, testID }: { chip: PracticeChip; label: string; testID?: string }) {
  return (
    <div
      data-testid={testID}
      className={clsx(
        "inline-flex min-h-8 items-center self-start rounded-[var(--radius-full)] px-4 py-1",
        PILL_TONE_BG[chip.state]
      )}
    >
      <AppText tone={PILL_TONE_TEXT[chip.state]} size="small" weight="medium">
        {label}
      </AppText>
    </div>
  );
}

export function PracticeHubScreen() {
  const { t } = useTranslation(["apprendre"]);
  const router = useRouter();
  const locale = useLocale();
  const isExamContextLoaded = useExamContextStore((s) => s.isLoaded);
  const board = useExamContextStore((s) => s.board);
  const level = useExamContextStore((s) => s.level);
  const { supported, chips } = usePracticeHub();

  // This route has no ancestor that hydrates the exam-context store (see
  // doc comment) — trigger it here, same idiom as `AccueilScreen`'s own
  // mount effect. `hydrate()` is idempotent/cheap to call again if some
  // other screen already did.
  useEffect(() => {
    void hydrateExamContext();
  }, []);

  const openModality = (modality: PracticeModality): void => {
    router.push(`/${locale}/app/apprendre/practice/${modality}`);
  };

  // Schreiben has no Übungstest picker — it routes straight to the prompt
  // list, seeded with the learner's current exam track via the one-shot
  // `?board=` param `PromptListScreen` consumes (module doc comment).
  const openSchreiben = (): void => {
    router.push(`/${locale}/app/schreiben?board=${board}-${level}`);
  };

  // Sprechen has no Übungstest picker either — routes straight to the
  // topic picker (Task 7.6).
  const openSprechen = (): void => {
    router.push(`/${locale}/app/sprechen`);
  };

  const chipLabel = (chip: PracticeChip): string => {
    switch (chip.state) {
      case "done":
        return t("apprendre:practice.chips.done");
      case "inProgress":
        return t("apprendre:practice.chips.inProgress", {
          locked: chip.locked,
          total: chip.total,
        });
      case "todo":
        return t("apprendre:practice.chips.todo");
    }
  };

  const hubTitle = t("apprendre:practice.hubTitle");

  // Waiting on the exam-context store's first hydration pass (S3 idiom —
  // `AccueilScreen` guards the same way) so we never flash the default
  // (board, level) combo before the real value lands.
  if (!isExamContextLoaded) {
    return (
      <div
        className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-4 py-8 lg:px-8"
        data-testid="practice-hub-loading"
      >
        <Skeleton.Block width="50%" height={24} aria-label={hubTitle} />
        <Skeleton.Block width="70%" height={16} aria-label={hubTitle} />
        <Skeleton.Card aria-label={hubTitle} />
        <Skeleton.Card aria-label={hubTitle} />
      </div>
    );
  }

  return (
    <div
      className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8 lg:px-8"
      data-testid="practice-hub-screen"
    >
      <AppText as="h1" family="serif" size="h2" weight="bold" testID="practice-hub-title">
        {hubTitle}
      </AppText>
      <AppText tone="secondary" size="body" testID="practice-hub-subtitle">
        {t("apprendre:practice.hubSubtitle")}
      </AppText>

      {!supported ? (
        <EmptyState
          testID="practice-hub-empty-state"
          title={t("apprendre:practice.emptyTitle")}
          description={t("apprendre:practice.unsupported")}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {/* web#60 sweep, final-review M-1: no wrapper
              `role="group"`/`aria-label` here. `role="group"` is not
              children-presentational on web (unlike mobile's `accessible`
              View), and `hubTitle` is already the visible `<h1>` rendered
              immediately above this div — a screen reader announced the
              section title, entered the group, and heard it a second
              time. Nothing here needs `aria-disabled`, so the role has no
              other job and goes with it. Same treatment as `FocusChips` /
              `ObservationCard` (commit `ab4a543`). */}
          {PRACTICE_MODALITIES.map((modality) => (
            <Card
              key={modality}
              testID={`practice-hub-row-${modality}`}
              onClick={() => openModality(modality)}
              className="flex items-center gap-3"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] bg-bg-subtle">
                <Icon name={ROW_ICON[modality]} size={24} />
              </div>
              <AppText family="serif" size="bodyLg" weight="semi" className="flex-1">
                {t(ROW_LABEL_KEY[modality])}
              </AppText>
              <ChipPill
                chip={chips[modality]}
                label={chipLabel(chips[modality])}
                testID={`practice-hub-row-${modality}-chip`}
              />
            </Card>
          ))}

          <Card
            testID="practice-hub-row-hoeren"
            onClick={() => openModality("hoeren")}
            className="flex items-center gap-3"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] bg-bg-subtle">
              <Icon name="hoeren" size={24} />
            </div>
            <AppText family="serif" size="bodyLg" weight="semi" className="flex-1">
              {t("apprendre:practice.rows.hoeren")}
            </AppText>
            <ChipPill
              chip={{ state: "todo" }}
              label={chipLabel({ state: "todo" })}
              testID="practice-hub-row-hoeren-chip"
            />
          </Card>

          <Card
            testID="practice-hub-row-schreiben"
            onClick={openSchreiben}
            className="flex items-center gap-3"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] bg-bg-subtle">
              <Icon name="schreiben" size={24} />
            </div>
            <AppText family="serif" size="bodyLg" weight="semi" className="flex-1">
              {t("apprendre:practice.rows.schreiben")}
            </AppText>
            <ChipPill
              chip={{ state: "todo" }}
              label={chipLabel({ state: "todo" })}
              testID="practice-hub-row-schreiben-chip"
            />
          </Card>

          <Card
            testID="practice-hub-row-sprechen"
            onClick={openSprechen}
            className="flex items-center gap-3"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] bg-bg-subtle">
              <Icon name="sprechen" size={24} />
            </div>
            <AppText family="serif" size="bodyLg" weight="semi" className="flex-1">
              {t("apprendre:practice.rows.sprechen")}
            </AppText>
            <ChipPill
              chip={{ state: "todo" }}
              label={chipLabel({ state: "todo" })}
              testID="practice-hub-row-sprechen-chip"
            />
          </Card>
        </div>
      )}
    </div>
  );
}
