"use client";

/**
 * Übungstest picker (Task 4.6) — sits between the Übungen hub and the
 * shared untimed practice session when a module has (or may have) more
 * than one published set. Web port of
 * `deutschfit-mobile/src/features/practice/screens/PracticeSetPickerScreen.tsx`.
 *
 * Enumerates sets via `usePracticeSets` (server: `practice-sets-list`,
 * slug asc) and forwards to the session route with the tapped slug
 * pinned. Per-set progress chips come from the local `practice_progress`
 * store, keyed by `quizSlug`. Chrome matches `PracticeHubScreen`: `Card`
 * rows, sprite icon badge, serif label, `ChipPill`, trailing chevron.
 *
 * With exactly ONE set the screen auto-forwards via `router.replace` (not
 * `push` — a picker-of-one shouldn't leave a back-stack entry the learner
 * can land back on) so the single-set journey keeps today's tap count.
 * `hasForwardedRef` + `isMountedRef` guard the effect: the former stops a
 * second `replace` call if the effect re-runs (e.g. React StrictMode's
 * double-invoke in dev) before navigation actually unmounts this screen;
 * the latter is the S3 async-then-navigate idiom
 * (`ChangeExamDateScreen.tsx`) even though `router.replace` itself is
 * synchronous — defends against a future refactor that awaits something
 * first.
 *
 * Session-route target (Task 5.5, spec §4 route map): the lock-based
 * `TextPracticeModality` set (`lesen`, `sprachbausteine`) forwards into
 * the shared session screen under this same route tree
 * (`/apprendre/practice/<modality>/session?slug=`); `hoeren` forwards to
 * its own session surface (`/app/hoeren/session?slug=`, built in Task
 * 5.7) instead — Hören keeps its own screen rather than joining the
 * shared, persistence-backed `PracticeSessionScreen` (P13: Hören
 * practice persists nothing). `sessionPath()` centralizes that branch so
 * both the row push and the single-set auto-forward stay in sync.
 */
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useTranslation } from "react-i18next";
import clsx from "clsx";

import { Icon } from "@/learner/core/icons/Icon";
import { AppText, Card, EmptyState, Skeleton, type AppTextTone } from "@/learner/ui/primitives";

import { usePracticeSets } from "../hooks/usePracticeSets";
import type { PracticeSetRow } from "../hooks/usePracticeSets";
import type { PracticeChip } from "../model/progressChip";
import type { PracticeModality } from "../model/types";

export interface PracticeSetPickerScreenProps {
  readonly modality: PracticeModality;
}

// Explicit map — no template-literal t() keys (the i18n linter and
// i18next-parser cannot see dynamic keys).
const TITLE_KEY: Record<PracticeModality, string> = {
  lesen: "apprendre:practice.rows.lesen",
  sprachbausteine: "apprendre:practice.rows.sprachbausteine",
  hoeren: "apprendre:practice.rows.hoeren",
};

// Per-modality session route (spec §4 route map) — see the module doc
// comment. Text modalities stay under this route tree; hoeren forwards to
// its own session surface.
function sessionPath(locale: string, modality: PracticeModality, slug: string): string {
  if (modality === "hoeren") {
    return `/${locale}/app/hoeren/session?slug=${slug}`;
  }
  return `/${locale}/app/apprendre/practice/${modality}/session?slug=${slug}`;
}

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

// Local composition over `AppText`'s tone prop — `Chip` (`@/learner/ui/
// primitives`) has no per-instance tone, same constraint `PracticeHubScreen`
// hit (see that file's doc comment). Duplicated rather than extracted
// because it's the only other current caller; extract to a shared
// `ChipPill` once a third caller needs it.
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

export function PracticeSetPickerScreen({ modality }: PracticeSetPickerScreenProps) {
  const { t } = useTranslation(["apprendre"]);
  const router = useRouter();
  const locale = useLocale();
  const { state, reload } = usePracticeSets(modality);

  // Single set → no picker value; forward straight into the session.
  const single = state.status === "ready" && state.sets.length === 1 ? state.sets[0] : null;
  const singleSlug = single?.slug ?? null;

  const isMountedRef = useRef(true);
  const hasForwardedRef = useRef<string | null>(null);
  useEffect(() => {
    // Re-arm on every setup invocation (web#38 idiom, mirrors
    // `SimulationOrchestratorScreen`/`useWebPushSettings`): StrictMode's dev
    // double-invoke runs setup → cleanup → setup on mount, and a
    // cleanup-only effect would leave this ref permanently `false` after
    // that cycle, silently dropping any async work that resolves later.
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  useEffect(() => {
    if (!singleSlug) {
      hasForwardedRef.current = null;
      return;
    }
    if (hasForwardedRef.current === singleSlug) return;
    if (!isMountedRef.current) return;
    hasForwardedRef.current = singleSlug;
    router.replace(sessionPath(locale, modality, singleSlug));
  }, [locale, modality, router, singleSlug]);

  const openSet = (set: PracticeSetRow): void => {
    router.push(sessionPath(locale, modality, set.slug));
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

  const title = t(TITLE_KEY[modality]);
  const subtitle = t("apprendre:practice.picker.subtitle");

  const header = (
    <>
      <AppText as="h1" family="serif" size="h2" weight="bold" testID="practice-set-picker-title">
        {title}
      </AppText>
      <AppText tone="secondary" size="body" testID="practice-set-picker-subtitle">
        {subtitle}
      </AppText>
    </>
  );

  if (state.status === "loading" || single) {
    return (
      <div
        className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8 lg:px-8"
        data-testid="practice-set-picker-loading"
      >
        {header}
        <div className="flex flex-col gap-3">
          <Skeleton.Card />
          <Skeleton.Card />
          <Skeleton.Card />
        </div>
      </div>
    );
  }

  return (
    <div
      className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8 lg:px-8"
      data-testid="practice-set-picker-screen"
    >
      {header}

      {state.status === "unsupported" ? (
        <EmptyState
          testID="practice-set-picker-unsupported"
          title={t("apprendre:practice.unsupported")}
        />
      ) : state.status === "error" ? (
        <div className="flex flex-col items-center gap-3" data-testid="practice-set-picker-error">
          <EmptyState title={t("apprendre:practice.picker.errorTitle")} />
          <button
            type="button"
            data-testid="practice-set-picker-error-retry"
            onClick={reload}
            className="min-h-11 rounded-[var(--radius-full)] bg-bg-card px-6 py-2 transition hover:opacity-90"
          >
            <AppText tone="primary" size="body" weight="semi">
              {t("apprendre:practice.session.retry")}
            </AppText>
          </button>
        </div>
      ) : state.sets.length === 0 ? (
        <EmptyState
          testID="practice-set-picker-empty-state"
          title={t("apprendre:practice.emptyTitle")}
          description={t("apprendre:practice.emptyDescription")}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {state.sets.map((set) => (
            <Card
              key={set.slug}
              testID={`practice-set-${set.slug}`}
              onClick={() => openSet(set)}
              className="flex items-center gap-3"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] bg-bg-subtle">
                <Icon name="target-focus" size={24} />
              </div>
              <AppText family="serif" size="bodyLg" weight="semi" className="flex-1">
                {t("apprendre:practice.picker.setLabel", { n: set.ordinal })}
              </AppText>
              <ChipPill
                chip={set.chip}
                label={chipLabel(set.chip)}
                testID={`practice-set-${set.slug}-chip`}
              />
              <Icon name="chevron" size={20} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
