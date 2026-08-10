"use client";

/**
 * `DrillSessionScreen` — full-screen adaptive drill session (System A —
 * S9 · Task 9.6). Web port of
 * `deutschfit-mobile/src/features/drill/screens/DrillSessionScreen.tsx`.
 * Branded "Betreuer" header, a 2px progress bar, then either a
 * `SessionMcqCard` (per question) or `SessionResults` (after the last
 * question).
 *
 * Deltas from mobile (task-9.6-brief.md):
 *   - D8 — web has no native back gesture, so the header carries an
 *     explicit close control (`router.back()`); mobile's header has
 *     none.
 *   - D6 — mobile is a root-modal screen whose home widget gates the
 *     "Vide" (empty) case, so a loaded session with zero items
 *     auto-dismisses via `navigation.goBack()`. The web Accueil CTA can
 *     race the recommendation (no equivalent modal-presentation gate
 *     here), so `in_progress` with zero items instead renders
 *     `DrillEmptyState` — the level-gate/no-gaps reason must stay
 *     visible rather than silently bouncing the learner back to
 *     Accueil.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { Icon } from "@/learner/core/icons/Icon";
import { hydrateExamContext, useExamContextStore } from "@/learner/core/exam/examContext";
import { AppText, ProgressBar } from "@/learner/ui/primitives";

import { DrillEmptyState } from "../components/DrillEmptyState";
import { SessionMcqCard } from "../components/SessionMcqCard";
import { SessionResults } from "../components/SessionResults";
import { useDrillSession } from "../hooks/useDrillSession";

export function DrillSessionScreen() {
  const router = useRouter();
  const { status, items, index, selected, summary, reason, answer, next } = useDrillSession();
  const currentLevel = useExamContextStore((s) => s.level);

  useEffect(() => {
    void hydrateExamContext();
  }, []);

  const current = items[index];

  const handleClose = (): void => {
    router.back();
  };

  return (
    <div
      className="flex h-full min-h-screen flex-col bg-bg-content"
      data-testid="drill-session-screen"
    >
      <div className="flex items-center justify-between bg-bg-premium px-4 py-3">
        <AppText size="small" weight="semi" tone="inverse">
          Betreuer
        </AppText>
        <button
          type="button"
          onClick={handleClose}
          aria-label="Fermer"
          data-testid="drill-session-close"
          className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] transition hover:opacity-80"
        >
          <Icon name="close" size={18} color="var(--color-on-premium)" label="Fermer" />
        </button>
      </div>

      {status === "in_progress" && items.length > 0 ? (
        <ProgressBar
          value={(index + 1) / items.length}
          tone="cta"
          className="h-0.5"
          testID="drill-session-progress"
        />
      ) : null}

      {status === "loading" ? (
        <div
          className="flex flex-1 items-center justify-center"
          data-testid="drill-session-loading"
        >
          <AppText size="body" tone="secondary">
            …
          </AppText>
        </div>
      ) : null}

      {status === "in_progress" && items.length === 0 ? (
        <div className="p-4">
          <DrillEmptyState
            reason={reason}
            userLevel={currentLevel.toUpperCase()}
            onRetry={handleClose}
            testID="drill-session-empty"
          />
        </div>
      ) : null}

      {status === "in_progress" && current ? (
        <div className="flex flex-col gap-3 p-4">
          <AppText size="caption" tone="secondary" testID="drill-session-question-label">
            {`Question ${index + 1}/${items.length}`}
          </AppText>
          <SessionMcqCard
            item={current}
            selected={selected}
            onSelect={(option) => {
              void answer(option);
            }}
            onContinue={next}
            testID="drill-session-mcq"
          />
        </div>
      ) : null}

      {status === "results" && summary ? (
        <SessionResults summary={summary} onFinish={handleClose} testID="drill-session-results" />
      ) : null}
    </div>
  );
}
