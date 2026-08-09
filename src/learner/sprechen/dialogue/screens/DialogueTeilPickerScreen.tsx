"use client";

/**
 * `DialogueTeilPickerScreen` — telc paired-Sprechen ("dialogue") Teil
 * picker (S7 · Task 7.11). Web port of `deutschfit-mobile/src/features/
 * sprechen/dialogue/screens/DialogueTeilPickerScreen.tsx` (262L) — read
 * fully before touching this file.
 *
 * Lists the dialogue Teile available for the learner's current exam
 * board+level (from `cert_dialogue_teile`, via `listDialogueTeile`) and
 * routes to the session route on selection.
 *
 * Hard rules (F-3 / telc board-blind, mobile-verbatim):
 *   - No board branding rendered on-screen.
 *   - No numeric budget / turn-count on cards — only `nativeLabel`, the
 *     task-type description, and the first theme's title.
 *
 * Web delta — exam-context hydration + `isLoaded` gate: mobile reads
 * `useExamContext()` from a provider that has already resolved by the time
 * any screen mounts. This app has no such provider at this altitude — this
 * screen self-hydrates on mount (`hydrateExamContext()`) and the
 * `listDialogueTeile` fetch is gated on `isExamContextLoaded`, same idiom
 * `TopicPickerScreen` established (`../../screens/TopicPickerScreen.tsx`)
 * and the same idiom this repo's `learner-sprechen-topic-picker.test.tsx`
 * proves fetch-once under React 18 StrictMode's double-invoke.
 *
 * Web delta — level casing: `useExamContextStore`'s `level` is lower-case
 * (`"b1"`, matches the `user_profiles.exam_level` DB check). The
 * `cert_dialogue_teile.level` column (and every dialogue wire call) is
 * upper-case (`"B1"` — see `deutschfit-backend` migration
 * `20260617010000_0128_cert_dialogue_teile.sql`'s check constraint and
 * `tests/unit/learner-dialogue-api.test.ts`'s fixtures). Every call site
 * here upper-cases the store's `level` before it reaches the wire — same
 * `.toUpperCase()` idiom `TopicPickerScreen.pickInitialLevel` already
 * uses for the monologue picker.
 *
 * Web delta — no `LiquidGlassTopBar` (mobile-only chrome primitive); this
 * repo's page shell owns the top nav.
 *
 * Constraint 15 (binding): feature code imports wire fns/types ONLY from
 * `@/learner/core/api/examApi`.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useTranslation } from "react-i18next";

import { AppButton, AppText, Card, EmptyState, Skeleton } from "@/learner/ui/primitives";

import { listDialogueTeile, type DialogueTeilConfig } from "@/learner/core/api/examApi";
import { hydrateExamContext, useExamContextStore } from "@/learner/core/exam/examContext";

// ---------------------------------------------------------------------------
// Internal state machine — mirrors mobile's `PickerState`.
// ---------------------------------------------------------------------------

type PickerState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "empty" }
  | { kind: "list"; teile: readonly DialogueTeilConfig[] };

export function DialogueTeilPickerScreen() {
  const router = useRouter();
  const locale = useLocale();
  const { t } = useTranslation("sprechen");

  const board = useExamContextStore((s) => s.board);
  const level = useExamContextStore((s) => s.level);
  const isExamContextLoaded = useExamContextStore((s) => s.isLoaded);

  // No ancestor hydrates the exam-context store for this route — same
  // idiom as `TopicPickerScreen`/`PromptListScreen`.
  useEffect(() => {
    void hydrateExamContext();
  }, []);

  const [state, setState] = useState<PickerState>({ kind: "loading" });
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    // Gate on `isExamContextLoaded` so this never fetches against the
    // un-hydrated default (board, level) — would warm the wrong cache key
    // / list the wrong board's Teile for a fraction of a second. Stays a
    // no-op through the initial mount, including React 18 StrictMode's
    // synchronous double-invoke of this effect; the real fetch fires once
    // `isLoaded` flips true (a normal, non-double-invoked re-render).
    if (!isExamContextLoaded) return;
    let cancelled = false;
    setState({ kind: "loading" });

    listDialogueTeile({ board, level: level.toUpperCase() })
      .then((configs) => {
        if (cancelled) return;
        if (configs.length === 0) {
          setState({ kind: "empty" });
        } else {
          setState({ kind: "list", teile: configs });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, [board, level, isExamContextLoaded, retryCount]);

  const handleRetry = useCallback(() => {
    setRetryCount((c) => c + 1);
  }, []);

  const handleCardPress = useCallback(
    (config: DialogueTeilConfig) => {
      const firstTheme = config.themes[0];
      const query = new URLSearchParams({ teil: config.teil });
      if (firstTheme !== undefined) query.set("themeId", firstTheme.slug);
      router.push(`/${locale}/app/sprechen/dialogue/session?${query.toString()}`);
    },
    [router, locale]
  );

  return (
    <div
      data-testid="dialogue-teil-picker"
      className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8 lg:px-8"
    >
      <div className="flex flex-col gap-1">
        <AppText as="h1" family="serif" size="h1" weight="bold">
          {t("dialoguePicker.title")}
        </AppText>
        <AppText tone="secondary" size="body">
          {t("dialoguePicker.subtitle")}
        </AppText>
      </div>

      {state.kind === "loading" ? (
        <div data-testid="dialogue-teil-picker-loading" className="flex flex-col gap-3">
          <Skeleton.Card />
          <Skeleton.Card />
          <Skeleton.Card />
        </div>
      ) : state.kind === "error" ? (
        <div
          data-testid="dialogue-teil-picker-error"
          className="flex flex-col items-center gap-3 py-8 text-center"
        >
          <AppText family="serif" size="h3" weight="semi" align="center">
            {t("dialoguePicker.error.title")}
          </AppText>
          <AppText tone="secondary" size="body" align="center">
            {t("dialoguePicker.error.body")}
          </AppText>
          <AppButton
            testID="dialogue-teil-picker-retry"
            label={t("dialoguePicker.error.retry")}
            onClick={handleRetry}
            variant="outline"
          />
        </div>
      ) : state.kind === "empty" ? (
        <EmptyState
          testID="dialogue-teil-picker-empty"
          title={t("dialoguePicker.empty.title")}
          description={t("dialoguePicker.empty.body")}
        />
      ) : (
        <div data-testid="dialogue-teil-picker-list" className="flex flex-col gap-3">
          {state.teile.map((teil) => {
            const firstTheme = teil.themes[0];
            return (
              <Card
                key={teil.dialogueTeilKey}
                testID={`dialogue-teil-card-${teil.teil}`}
                onClick={() => handleCardPress(teil)}
                className="flex flex-col gap-1"
              >
                <AppText family="serif" size="h3" weight="semi">
                  {teil.nativeLabel}
                </AppText>
                <AppText tone="secondary" size="body">
                  {t(`dialoguePicker.taskType.${teil.taskType}`)}
                </AppText>
                {firstTheme !== undefined ? (
                  <AppText tone="secondary" size="small">
                    {t("dialoguePicker.themeLabel", { title: firstTheme.titleDe })}
                  </AppText>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
