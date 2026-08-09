"use client";

/**
 * Übungen hub (§6.5) — one untimed practice entry per module for the
 * learner's (board, level). Web port of
 * `deutschfit-mobile/src/features/practice/screens/PracticeHubScreen.tsx`.
 *
 * Chips (`lesen` + `sprachbausteine`) come exclusively from
 * `usePracticeHub` — Dexie `practice_progress` reads, zero network calls
 * (P12). `hoeren` + `schreiben` render as static rows, both disabled with
 * the `comingSoon` pill this slice: mobile links `hoeren` to the Hören
 * navigator and `schreiben` to the Writing stack, but neither surface has
 * a web equivalent yet (`src/learner/hoeren` and `src/learner/schreiben`
 * are still S0 placeholder directories) — S5+ wires them up and flips
 * these rows active. Deviates from mobile's brief note (which calls out
 * only `hoeren`'s deviation) because on web `schreiben` is equally
 * unbuilt, not just `hoeren`.
 *
 * The `lesen`/`sprachbausteine` rows route to the Übungstest picker
 * (`/apprendre/practice/<modality>`, Task 4.6/4.7 — mobile parity: rows are
 * tappable) since that surface and the session screen now exist. `hoeren`
 * + `schreiben` stay non-interactive, mirroring `PerformanceHistoryScreen`'s
 * precedent for rows whose tap-through target hasn't shipped
 * (`aria-disabled` placeholder, no `onClick`).
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
import type { PracticeModality } from "../model/types";

const PRACTICE_MODALITIES: readonly PracticeModality[] = ["lesen", "sprachbausteine"];

// Explicit map — no template-literal t() keys (i18next-parser can't see dynamic keys).
const ROW_LABEL_KEY: Record<PracticeModality, string> = {
  lesen: "apprendre:practice.rows.lesen",
  sprachbausteine: "apprendre:practice.rows.sprachbausteine",
};

// Canonical sprite glyphs only — never invent icons.
const ROW_ICON: Record<PracticeModality, IconName> = {
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
  const comingSoonLabel = t("apprendre:comingSoon");

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
        <div role="group" aria-label={hubTitle} className="flex flex-col gap-3">
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

          <div
            role="group"
            aria-disabled="true"
            aria-label={`${t("apprendre:practice.rows.hoeren")} – ${comingSoonLabel}`}
            data-testid="practice-hub-row-hoeren"
          >
            <Card className="flex items-center gap-3 opacity-55">
              <div className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] bg-bg-subtle">
                <Icon name="hoeren" size={24} />
              </div>
              <AppText family="serif" size="bodyLg" weight="semi" className="flex-1">
                {t("apprendre:practice.rows.hoeren")}
              </AppText>
              <ChipPill
                chip={{ state: "todo" }}
                label={comingSoonLabel}
                testID="practice-hub-row-hoeren-coming-soon"
              />
            </Card>
          </div>

          <div
            role="group"
            aria-disabled="true"
            aria-label={`${t("apprendre:practice.rows.schreiben")} – ${comingSoonLabel}`}
            data-testid="practice-hub-row-schreiben"
          >
            <Card className="flex items-center gap-3 opacity-55">
              <div className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] bg-bg-subtle">
                <Icon name="schreiben" size={24} />
              </div>
              <AppText family="serif" size="bodyLg" weight="semi" className="flex-1">
                {t("apprendre:practice.rows.schreiben")}
              </AppText>
              <ChipPill
                chip={{ state: "todo" }}
                label={comingSoonLabel}
                testID="practice-hub-row-schreiben-coming-soon"
              />
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
