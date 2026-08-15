"use client";

/**
 * `FeedbackScreen` — Schreiben result screen (S6 Task 6.9). Web port of
 * `deutschfit-mobile/src/features/writing/screens/FeedbackScreen.tsx`
 * (729 lines — read fully before touching this file). Polls the
 * submission (`useSubmissionPolling`, Task 6.4) until it reaches a
 * terminal state:
 *
 *   - `idle` / `pending` / `grading` → calm "on corrige…" copy.
 *   - `timeout` (240 s wall-clock budget exhausted client-side) →
 *     poll_exhausted title/body + a Home CTA.
 *   - `failed` → failed title/message + a retry CTA (`router.back()`).
 *   - `graded` → the card stack below.
 *
 * Graded layout (LOCKED order — regression-tested by DOM position in
 * `tests/unit/learner-schreiben-feedback.test.tsx`):
 *
 *   1. Exam badge (cert/level/Teil, mobile #361) — `formatExamPrefix` +
 *      `writing:feedback.teilLabel`, resolved from the prompt's
 *      `exam_board`/`teil` once `listPrompts` hydrates.
 *   2. `ModuleResultLayout` (Task 6.5) — board-blind points scorecard XOR
 *      donut + rubric bars. FIRST content block (approved redesign: the
 *      score summary leads, above the essay text and Prüfer/Betreuer
 *      prose) — new-format rows only (`pruefer_text !== null`).
 *   3. Prompt card (title via the same cache) → 4. Text card (`body_de`,
 *      always renders) → 5. Prüfer card (`pruefer_text`) → 6. Betreuer
 *      card (`betreuer_text`).
 *   - Legacy rows (`pruefer_text === null`, pre-v2 text grader) render a
 *     best-effort `score / 100` card (`legacyScore` — sum of the three
 *     Goethe sub-scores × 4) + a "cette correction est dans l'ancien
 *     format" note, and skip `ModuleResultLayout`/Prüfer/Betreuer.
 *
 * Anti-requirements (binding, mobile carries both — this screen must
 * NOT): no `PostGradeDrillCard`, no `missing_structures` link-out. Both
 * are S7+ surfaces; porting them here would be scope creep on a P6-locked
 * layout.
 *
 * `acknowledgeReadiness({ submissionId, module: "schreiben", acknowledgedAt })`
 * fires once per mount on the `graded` transition (`clearedRef` guard,
 * mobile-verbatim) — this is what drops the Accueil Hero pulse / StatusStrip
 * slot once the learner has actually opened the result.
 *
 * Route split (same established pattern as `SchreibenEditorScreen`, Task
 * 6.8): `submissionId` is a PROP, not read via `useParams()` directly in
 * this screen — the page component
 * (`app/[locale]/(learner)/app/(protected)/schreiben/feedback/[submissionId]/page.tsx`)
 * reads the dynamic segment and passes it down, keeping this screen
 * testable without mocking `next/navigation`'s `useParams`.
 *
 * Prompt resolution (Web delta from mobile's parameter-free
 * `listPrompts()`): web's `listPrompts(board, level)` is cache-keyed by
 * `(examBoard, examLevel)` (Task 6.2 `promptsCacheKey`), so this screen
 * self-hydrates the exam-context store on mount and gates the fetch on
 * `isLoaded` — same idiom `SchreibenEditorScreen` established for
 * deep-linkable S6 routes. A submission's own prompt may not match the
 * learner's *current* board/level (e.g. after a level change) — the
 * badge/prompt-card simply stay hidden in that case, same graceful
 * degrade as a rejected `listPrompts()` fetch.
 *
 * F10 (Web delta, doc-commented per the task brief): mobile's FAILED
 * branch root carries no `schreiben-feedback-screen` testID
 * (`FeedbackScreen.tsx:246-247` on mobile). This screen puts the root
 * testID on ALL branches — pending/timeout/failed/graded — for e2e
 * locator stability (a Playwright spec can always find the screen root
 * regardless of which polling state it lands on).
 *
 * Retake/Home CTA routing (Web delta — no React Navigation stack here):
 *   - Retake → `router.replace(/{locale}/app/schreiben/compose/{promptId})`
 *     when a `promptId` is known; falls back to the prompt list
 *     (`/{locale}/app/schreiben`) when it isn't (mobile: `popToTop()`,
 *     which lands on the same Writing-stack root).
 *   - Home → `router.push(/{locale}/app)` (mobile: parent-tab navigate to
 *     Accueil; `/{locale}/app` is this app's Accueil route — see
 *     `app/[locale]/(learner)/app/(protected)/page.tsx`).
 *   Both emit the catalogued `schreiben_result_retake_tapped` /
 *   `schreiben_result_home_tapped` events (already typed in
 *   `core/analytics/posthog.ts` — no catalog edit needed this task).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useTranslation } from "react-i18next";

import { AppButton, AppText, EmptyState } from "@/learner/ui/primitives";

import { listPrompts, type WritingPrompt } from "@/learner/core/api/examApi";
import { hydrateExamContext, useExamContextStore } from "@/learner/core/exam/examContext";
import { acknowledgeReadiness } from "@/learner/core/readiness";
import { trackEvent } from "@/learner/core/analytics/posthog";
import {
  ModuleResultLayout,
  dimensionScoresFromWire,
} from "@/learner/ui/blocks/ModuleResultLayout";

import { useSubmissionPolling } from "../hooks/useSubmissionPolling";

export interface FeedbackScreenProps {
  readonly submissionId: string;
}

/**
 * Display labels for the five exam boards. Ported verbatim from mobile
 * `FeedbackScreen.tsx:62-68` — the prompt's `exam_board` field is a
 * framework slug (`goethe-b1`, `telc-c1-hochschule`); the badge surfaces
 * a human-readable form. Unknown boards fall through to a title-cased
 * slug rather than being dropped.
 *
 * Deliberately NOT reused from `examBoardLabel.ts` (Task 6.6) — that
 * helper space-joins tokens (`"Goethe B2"`) for the prompt-list filter
 * chips; this badge mid-dot-joins (`"Goethe · B1"`) and returns `null`
 * on a malformed slug instead of degrading, matching mobile's
 * `FeedbackScreen`-local `formatExamPrefix` exactly.
 */
const EXAM_BOARD_LABELS: Readonly<Record<string, string>> = {
  goethe: "Goethe",
  telc: "telc",
  oesd: "ÖSD",
  testdaf: "TestDaF",
  ecl: "ECL",
};

function titleCase(segment: string): string {
  if (segment.length === 0) return segment;
  return segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase();
}

/**
 * Build the "Goethe · B1" (and optional " · Hochschule" variant) prefix
 * from an `exam_board` slug. Returns `null` when the slug lacks the
 * board+level pair the badge needs. Ported verbatim from mobile
 * `FeedbackScreen.tsx:78-89`.
 */
function formatExamPrefix(examBoard: string | null): string | null {
  if (!examBoard) return null;
  const segments = examBoard.split("-").filter((s) => s.length > 0);
  const boardRaw = segments[0];
  const levelRaw = segments[1];
  if (boardRaw === undefined || levelRaw === undefined) return null;
  const board = EXAM_BOARD_LABELS[boardRaw.toLowerCase()] ?? titleCase(boardRaw);
  const level = levelRaw.toUpperCase();
  const variant = segments.slice(2).map(titleCase).join(" · ");
  return variant ? `${board} · ${level} · ${variant}` : `${board} · ${level}`;
}

/**
 * Legacy rows persisted before the four-key text grader (PR-D) have
 * `pruefer_text=null` and store the 3-criterion Goethe shape in `score_*`
 * columns. Sum those to a 0-100 best-effort number so the card still has
 * something to render. Returns `null` when the row has no usable signal
 * at all. Ported verbatim from mobile `FeedbackScreen.tsx:619-633`.
 */
function legacyScore(row: {
  score_inhalt?: number | null;
  score_wortschatz_gram?: number | null;
  score_kommunikation?: number | null;
}): number | null {
  const a = row.score_inhalt;
  const b = row.score_wortschatz_gram;
  const c = row.score_kommunikation;
  if (a == null && b == null && c == null) return null;
  const sum = (a ?? 0) + (b ?? 0) + (c ?? 0);
  return Math.round(sum * 4);
}

export function FeedbackScreen({ submissionId }: FeedbackScreenProps) {
  const router = useRouter();
  const locale = useLocale();
  const { t } = useTranslation(["writing"]);

  const board = useExamContextStore((s) => s.board);
  const level = useExamContextStore((s) => s.level);
  const isExamContextLoaded = useExamContextStore((s) => s.isLoaded);

  useEffect(() => {
    void hydrateExamContext();
  }, []);

  const { data, status } = useSubmissionPolling(submissionId);

  const handleRetry = useCallback(() => {
    router.back();
  }, [router]);

  const promptId = data?.prompt_id ?? null;

  // Resolve the prompt's German title + exam_board/teil for the "Consigne"
  // header card and the exam badge. `submissions-get` does not embed the
  // prompt — look it up against the cached prompt list keyed by
  // (board, level). `listPrompts` is a no-op fetch when the key is already
  // warm (e.g. the S4 login prefetch), so this costs at most one network
  // call per submission.
  const [promptInfo, setPromptInfo] = useState<WritingPrompt | null>(null);
  const fetchedPromptIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isExamContextLoaded) return;
    if (!promptId) return;
    if (fetchedPromptIdRef.current === promptId) return;
    fetchedPromptIdRef.current = promptId;
    let cancelled = false;
    (async () => {
      try {
        const prompts = await listPrompts(board, level);
        if (cancelled) return;
        const found = prompts.find((p) => p.id === promptId) ?? null;
        setPromptInfo(found);
      } catch {
        // Title/badge are nice-to-haves; a missing prompt (or a fetch
        // failure) must not break the graded card stack. Leave the
        // cards hidden — same degrade as mobile.
        if (!cancelled) {
          setPromptInfo(null);
          // S7 Task 7.9 fix (Constraint 9 carry-in c): reset the one-shot
          // guard on failure. Without this, a transient `listPrompts`
          // error permanently sticks `fetchedPromptIdRef.current` to
          // `promptId`, so no later dependency change can ever retry the
          // fetch — the badge/prompt card stays hidden forever instead of
          // just for the duration of the outage.
          fetchedPromptIdRef.current = null;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isExamContextLoaded, board, level, promptId]);

  const handleRetake = useCallback((): void => {
    trackEvent("schreiben_result_retake_tapped", { prompt_id: promptId ?? undefined });
    if (promptId) {
      router.replace(`/${locale}/app/schreiben/compose/${promptId}`);
    } else {
      router.push(`/${locale}/app/schreiben`);
    }
  }, [router, locale, promptId]);

  const handleHome = useCallback((): void => {
    trackEvent("schreiben_result_home_tapped", { prompt_id: promptId ?? undefined });
    router.push(`/${locale}/app`);
  }, [router, locale, promptId]);

  // Once-guard — fires `acknowledgeReadiness` a single time on the
  // `graded` transition regardless of how many re-renders follow.
  // Mobile-verbatim (`FeedbackScreen.tsx:178-188`).
  const clearedRef = useRef(false);
  useEffect(() => {
    if (status === "graded" && !clearedRef.current) {
      clearedRef.current = true;
      acknowledgeReadiness({
        submissionId,
        module: "schreiben",
        acknowledgedAt: Date.now(),
      });
    }
  }, [status, submissionId]);

  if (status === "idle" || status === "pending" || status === "grading") {
    return (
      <div
        data-testid="schreiben-feedback-screen"
        className="mx-auto flex min-h-[var(--state-panel-min-height)] w-full max-w-2xl flex-col items-center justify-center gap-4 px-4 py-16 text-center lg:px-8"
      >
        <AppText tone="secondary" size="body">
          {t("writing:feedback.pending")}
        </AppText>
      </div>
    );
  }

  if (status === "timeout") {
    return (
      <div
        data-testid="schreiben-feedback-screen"
        className="mx-auto flex min-h-[var(--state-panel-min-height)] w-full max-w-2xl flex-col items-center justify-center gap-4 px-4 py-16 lg:px-8"
      >
        <EmptyState
          testID="schreiben-feedback-timeout"
          title={t("writing:feedback.poll_exhausted.title")}
          description={t("writing:feedback.poll_exhausted.body")}
          actionLabel={t("writing:feedback.poll_exhausted.cta")}
          onAction={handleHome}
        />
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div
        data-testid="schreiben-feedback-screen"
        className="mx-auto flex min-h-[var(--state-panel-min-height)] w-full max-w-2xl flex-col items-center justify-center gap-4 px-4 py-16 lg:px-8"
      >
        <EmptyState
          testID="schreiben-feedback-failed"
          title={t("writing:feedback.failed.title")}
          description={t("writing:feedback.failed.message")}
          actionLabel={t("writing:feedback.failed.retry")}
          onAction={handleRetry}
        />
      </div>
    );
  }

  // graded
  const bodyDe = data?.body_de ?? "";
  const prueferText = data?.pruefer_text ?? null;
  const betreuerText = data?.betreuer_text ?? null;
  const isNewFormat = prueferText !== null;
  // `score` feeds only the legacy `score / 100` card below; the new
  // format renders its total via `ModuleResultLayout`'s scorecard/donut.
  const score = isNewFormat ? null : legacyScore(data ?? {});

  // Cert/level/Teil badge (mobile #361). Sourced from the resolved
  // prompt's `exam_board` slug + `teil`; hidden until the prompt resolves.
  const examPrefix = formatExamPrefix(promptInfo?.exam_board ?? null);
  const examBadge =
    examPrefix === null
      ? null
      : promptInfo?.teil != null
        ? `${examPrefix} · ${t("writing:feedback.teilLabel", { teil: promptInfo.teil })}`
        : examPrefix;

  // Integrated eyebrow for the board-native scorecard ("Total · telc ·
  // B2 · Schreiben"). Distinct from `examBadge` above (which carries the
  // Teil); this labels the headline number as the module total. Null
  // when the board/level can't be resolved. Mobile-verbatim composition
  // (`FeedbackScreen.tsx:304-309`).
  const scorecardEyebrow =
    examPrefix === null
      ? null
      : `${t("writing:feedback.scorecard.totalLabel")} · ${examPrefix} · ${t(
          "writing:feedback.scorecard.moduleLabel"
        )}`;

  return (
    <div
      data-testid="schreiben-feedback-screen"
      className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6 lg:px-8"
    >
      {examBadge ? (
        <div
          data-testid="schreiben-feedback-exam-badge"
          className="self-start rounded-[var(--radius-full)] border border-line-subtle bg-bg-card px-4 py-1"
        >
          <AppText tone="secondary" size="small" weight="semi">
            {examBadge}
          </AppText>
        </div>
      ) : null}

      {/* Score summary leads the screen (approved redesign): the
          headline number + pass marker is the first content block, above
          the essay text and the Prüfer/Betreuer prose. Locked by the
          section-order regression test in
          `tests/unit/learner-schreiben-feedback.test.tsx`. */}
      {isNewFormat ? (
        <ModuleResultLayout
          dimensionScores={dimensionScoresFromWire(data?.dimension_scores_json)}
          coachFeedbackFr={null}
          nextDrillFr={null}
          focusAreas={[]}
          personalizedModelDe={null}
          rawText={null}
          normalizedTotalPct={data?.normalized_total_pct ?? null}
          score={data?.score ?? null}
          scoreMax={data?.score_max ?? null}
          passFloorPoints={data?.pass_floor_points ?? null}
          scoreUnitLabel={t("writing:feedback.scorecard.unitLabel")}
          eyebrow={scorecardEyebrow}
          objectiveLabel={t("writing:feedback.scorecard.objectiveLabel")}
          testID="schreiben-feedback-module-result"
        />
      ) : null}

      {promptInfo?.title_de ? (
        <div
          data-testid="schreiben-feedback-prompt-card"
          className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-line-soft bg-bg-card p-4"
        >
          <AppText as="h2" family="serif" size="h3" weight="bold">
            {t("writing:feedback.promptHeader")}
          </AppText>
          <AppText tone="secondary" size="body" className="leading-6">
            {promptInfo.title_de}
          </AppText>
        </div>
      ) : null}

      <div
        data-testid="schreiben-feedback-text-card"
        className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-line-soft bg-bg-card p-4"
      >
        <AppText as="h2" family="serif" size="h3" weight="bold">
          {t("writing:feedback.textTitle")}
        </AppText>
        <AppText tone="secondary" size="body" className="leading-6">
          {bodyDe}
        </AppText>
      </div>

      {!isNewFormat && score !== null ? (
        <div
          data-testid="schreiben-feedback-score-card"
          className="flex flex-col items-center gap-2 rounded-[var(--radius-lg)] border border-line-soft bg-bg-card p-6"
        >
          <AppText family="serif" size="display" weight="bold" align="center" numeric>
            {t("writing:feedback.scoreOutOf100", { score })}
          </AppText>
        </div>
      ) : null}

      {isNewFormat && prueferText ? (
        <div
          data-testid="schreiben-feedback-pruefer-card"
          className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-line-soft bg-bg-card p-4"
        >
          <AppText as="h2" family="serif" size="h3" weight="bold">
            {t("writing:feedback.prueferTitle")}
          </AppText>
          <AppText tone="secondary" size="body" className="leading-6">
            {prueferText}
          </AppText>
        </div>
      ) : null}

      {isNewFormat && betreuerText ? (
        <div
          data-testid="schreiben-feedback-betreuer-card"
          className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-line-soft bg-bg-card p-4"
        >
          <AppText as="h2" family="serif" size="h3" weight="bold">
            {t("writing:feedback.betreuerTitle")}
          </AppText>
          <AppText tone="secondary" size="body" className="leading-6">
            {betreuerText}
          </AppText>
        </div>
      ) : null}

      {!isNewFormat ? (
        <AppText
          testID="schreiben-feedback-legacy-note"
          tone="secondary"
          size="small"
          align="center"
          className="italic"
        >
          {t("writing:feedback.legacyFormatNote")}
        </AppText>
      ) : null}

      <div className="mt-2 flex flex-col gap-3 border-t border-line-subtle pt-4 sm:flex-row">
        <AppButton
          testID="schreiben-feedback-retake-cta"
          label={t("writing:feedback.retake")}
          onClick={handleRetake}
          className="flex-1"
        />
        <AppButton
          testID="schreiben-feedback-home-cta"
          label={t("writing:feedback.backToHome")}
          onClick={handleHome}
          variant="outline"
          className="flex-1"
        />
      </div>
    </div>
  );
}
