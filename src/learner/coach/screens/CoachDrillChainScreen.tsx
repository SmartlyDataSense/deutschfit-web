"use client";

/**
 * `CoachDrillChainScreen` — the personalised drill runner (S9 · Task
 * 9.5). Ports
 * `deutschfit-mobile/src/features/coach/screens/CoachDrillChainScreen.tsx`.
 *
 * Entry: the Coach chat screen's drill CTA writes a `DrillChainLaunch`
 * into `useDrillChainStore` (`{threadId, observationId, connectors,
 * drills}`) and pushes `${base}/coach/drill-chain` — this screen has no
 * route params of its own (see `drillChainStore.ts`'s docstring for why:
 * mobile threads the same payload through React Navigation params,
 * web's App Router has no equivalent for a same-origin push). If the
 * store's `launch` is `null` on mount (direct nav / refresh / back-nav
 * after the store already cleared), the screen bails straight back to
 * `${base}/coach/chat` — there is nothing to run.
 *
 * Layout:
 *   - `DrillChainHeader` — back + coach identity + "Drill N / M" pips.
 *   - `DrillCard` — a single connector-cloze item with MCQ options.
 *   - Footer CTA — "Continuer" (or "Terminer" on the last drill) — only
 *     enabled once the learner has locked in a pick.
 *
 * On the last drill's continue, we write a one-shot `PendingDrillSummary`
 * into the store and navigate back to `CoachChat` with the triggering
 * thread id; `ChatContent` consumes it once to render an in-thread
 * summary bubble (Task 9.4). The header's back/close buttons bail out of
 * the chain early without surfacing a summary.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useTranslation } from "react-i18next";

import { trackEvent } from "@/learner/core/analytics/posthog";
import { AppButton, AppText } from "@/learner/ui/primitives";

import { DrillCard } from "../components/DrillCard";
import { DrillChainHeader } from "../components/DrillChainHeader";
import { useDrillChainStore } from "../drillChainStore";
import { buildConnectorDrillChain } from "../drills/data";
import { useDrillChain } from "../drills/useDrillChain";
import type { DrillChain } from "../drills/types";

const EMPTY_CHAIN: DrillChain = { id: "empty", observationId: "", drills: [] };

function generateNonce(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function CoachDrillChainScreen() {
  const router = useRouter();
  const locale = useLocale();
  const base = `/${locale}/app`;
  const { t } = useTranslation(["coach"]);

  const launch = useDrillChainStore((s) => s.launch);

  // Per-attempt nonce mixed into the chain seed so consecutive
  // "Démarrer le drill" taps don't replay the same chain. Minted once
  // per screen mount (useRef survives re-renders; useMemo would re-fire
  // on dep changes) so resuming mid-chain after a re-render yields the
  // SAME chain — only navigating into the screen afresh produces a new
  // walk through the template pool. One-shot ref assigned inside the
  // render body is safe here (not an effect) — there is no cleanup to
  // pair it with, so Constraint 12's "cleanup-only mounted-ref" trap
  // does not apply.
  const nonceRef = useRef<string>("");
  if (nonceRef.current === "") {
    nonceRef.current = generateNonce();
  }
  const nonce = nonceRef.current;

  const chain = useMemo<DrillChain>(() => {
    if (!launch) return EMPTY_CHAIN;
    return buildConnectorDrillChain({
      observationId: launch.observationId,
      templates: launch.drills,
      flaggedConnectors: launch.connectors,
      nonce,
    });
  }, [launch, nonce]);

  const { state, answer, next } = useDrillChain(chain);

  // No launch payload to run — bounce straight back to chat. Re-armed
  // on every effect run (Constraint 12) — a plain declarative redirect,
  // not a one-shot boot ref.
  useEffect(() => {
    if (launch === null) {
      router.replace(`${base}/coach/chat`);
    }
  }, [launch, router, base]);

  // Fire `coach_drill_chain_started` exactly once per mount. The ref is
  // assigned INSIDE the effect body (Constraint 12) — a dev-StrictMode
  // double-invoke re-runs this same effect against the same fiber, so
  // the ref already reads `true` on the second pass and the event does
  // not double-fire; a fresh mount (new chain run) starts with a fresh
  // ref.
  const startedRef = useRef(false);
  const chainLength = chain.drills.length;
  const observationId = launch?.observationId;
  useEffect(() => {
    if (!observationId) return;
    if (startedRef.current) return;
    startedRef.current = true;
    trackEvent("coach_drill_chain_started", {
      observation_id: observationId,
      chain_length: chainLength,
    });
  }, [observationId, chainLength]);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const handleClose = useCallback(() => {
    if (!launch) return;
    router.push(`${base}/coach/chat/${launch.threadId}`);
  }, [router, base, launch]);

  const handleSelect = useCallback(
    (option: string) => {
      answer(option);
    },
    [answer]
  );

  const handleContinue = useCallback(() => {
    next(); // state/pendingAttempt reads below are the PRE-commit closure snapshot — intentional (task-9.5-brief.md critique patch I3).
    if (!launch) return;
    if (state.currentIndex === chain.drills.length - 1) {
      const finalCorrect =
        state.attempts.filter((a) => a.isCorrect).length +
        (state.pendingAttempt?.isCorrect ? 1 : 0);
      trackEvent("coach_drill_chain_completed", {
        observation_id: launch.observationId,
        chain_length: chain.drills.length,
        completed_count: chain.drills.length,
      });
      useDrillChainStore.getState().setPendingSummary({
        id: `drill-summary-${launch.observationId}-${Date.now().toString(36)}`,
        correct: finalCorrect,
        total: chain.drills.length,
      });
      useDrillChainStore.getState().clearLaunch();
      router.push(`${base}/coach/chat/${launch.threadId}`);
    }
  }, [next, launch, state, chain, router, base]);

  if (launch === null) {
    // The redirect fires in the effect above; render nothing while it
    // takes effect.
    return null;
  }

  if (chain.drills.length === 0) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-4 p-6"
        data-testid="coach-drill-chain-fallback"
      >
        <AppText tone="secondary" size="body">
          {t("coach:drills.fallback")}
        </AppText>
        <AppButton
          label={t("coach:drills.summary.returnCta")}
          onClick={handleClose}
          variant="outline"
          testID="coach-drill-chain-return"
        />
      </div>
    );
  }

  const current = chain.drills[state.currentIndex] ?? null;

  if (!current || state.status === "complete") {
    // Defensive fallback if the cursor ever lands out-of-range — the
    // summary navigation already fires in `handleContinue`.
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-4 p-6"
        data-testid="coach-drill-chain-fallback"
      >
        <AppText tone="secondary" size="body">
          {t("coach:drills.fallback")}
        </AppText>
        <AppButton
          label={t("coach:drills.summary.returnCta")}
          onClick={handleClose}
          variant="outline"
          testID="coach-drill-chain-return"
        />
      </div>
    );
  }

  const total = chain.drills.length;
  const displayIndex = state.currentIndex + 1;
  const isAnswered = state.pendingAttempt !== null;
  const isLast = state.currentIndex === total - 1;
  const ctaLabel = isAnswered
    ? isLast
      ? t("coach:drills.finishCta")
      : t("coach:drills.continueCta")
    : t("coach:drills.submitCta");
  const correctSoFar =
    state.attempts.filter((a) => a.isCorrect).length + (state.pendingAttempt?.isCorrect ? 1 : 0);

  return (
    <div className="flex h-full flex-col" data-testid="coach-drill-chain-screen">
      <DrillChainHeader
        title={t("coach:drills.header.title")}
        subtitle={t("coach:drills.header.subtitle")}
        avatarInitials={t("coach:drills.header.avatarInitials")}
        onBack={handleBack}
        onClose={handleClose}
        backAccessibilityLabel={t("coach:drills.header.backA11y")}
        closeAccessibilityLabel={t("coach:drills.header.closeA11y")}
        progressLabel={t("coach:drills.progressLabel")}
        current={displayIndex}
        total={total}
        testID="coach-drill-chain-header"
      />

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
        <DrillCard
          overlineLabel={t("coach:drills.card.overline")}
          before={current.before}
          after={current.after}
          options={current.options}
          answer={current.answer}
          {...(state.pendingAttempt !== null ? { selected: state.pendingAttempt.selected } : {})}
          onSelect={handleSelect}
          explanation={current.explanation}
          explanationLabel={t("coach:drills.card.explanationLabel")}
          optionA11yPrefix={t("coach:drills.card.optionA11yPrefix")}
          testID={`coach-drill-card-${current.id}`}
        />

        {isAnswered && state.pendingAttempt ? (
          <div className="flex flex-col gap-1" data-testid="coach-drill-feedback" role="status">
            <AppText
              tone={state.pendingAttempt.isCorrect ? "success" : "warning"}
              size="body"
              weight="semi"
            >
              {state.pendingAttempt.isCorrect
                ? t("coach:drills.feedback.correct")
                : t("coach:drills.feedback.wrong", { answer: current.answer })}
            </AppText>
            <AppText tone="tertiary" size="caption" className="tracking-wide">
              {t("coach:drills.tally", { correct: correctSoFar, total: state.attempts.length + 1 })}
            </AppText>
          </div>
        ) : null}
      </div>

      <div className="border-t border-line-soft px-4 pt-3 pb-4">
        <AppButton
          label={ctaLabel}
          onClick={handleContinue}
          disabled={!isAnswered}
          variant="solid"
          testID="coach-drill-continue"
        />
      </div>
    </div>
  );
}
