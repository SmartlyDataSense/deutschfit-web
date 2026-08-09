"use client";

/**
 * `SchreibenEditorScreen` — the composer (S6 Task 6.8). Web port of
 * `deutschfit-mobile/src/features/writing/screens/SchreibenEditorScreen.tsx`
 * (764 lines — read fully before touching this file). Word-count-gated
 * draft editor with a confirm-before-submit dialog, autosaved draft
 * (`useDraft`, Task 6.3), and a sticky per-kind error banner for the
 * discriminated `SubmitError` surface (Task 6.2).
 *
 * Route split (Web delta from the brief's literal "promptId via
 * useParams()"): unlike mobile's `route.params`, this screen takes
 * `promptId` as a PROP — the page component
 * (`app/[locale]/(learner)/app/(protected)/schreiben/compose/[promptId]/page.tsx`)
 * reads the dynamic segment via `useParams()` and passes it down. This
 * mirrors the one existing dynamic-route precedent in this app
 * (`apprendre/practice/[modality]/page.tsx` → `PracticeSetPickerScreen`)
 * and keeps this screen testable without mocking `next/navigation`'s
 * `useParams`.
 *
 * Exam-context hydration gate (S4 idiom, established by
 * `HoerenIntroScreen`/`PromptListScreen`/`CustomPromptScreen`): this route
 * is deep-linkable and its ancestor layout chain never calls
 * `hydrateExamContext()`, so the screen self-hydrates on mount. The
 * `listPrompts(board, level)` fetch is gated on `isLoaded` — never fires
 * against the un-hydrated default (board, level), same rationale as
 * `PromptListScreen`.
 *
 * Prompt resolution: `listPrompts(board, level)` (SWR-cached — same
 * `promptsCacheKey` the login prefetch warms) is searched for `promptId`.
 * Web delta (brief-mandated, not in mobile): when the fetch completes and
 * no matching row is found — whether the fetch itself errored (caught
 * silently, same as mobile) or it succeeded but the id just isn't in the
 * list — this screen renders a dedicated "prompt not found" error state
 * with a back-to-list CTA, instead of mobile's silent degrade to an
 * unsubmittable empty-prompt editor. `min_words`/`max_words` gating and
 * the task card both need a real prompt row to mean anything on web, so a
 * missing prompt is treated as a hard stop here.
 *
 * F8 — two DISTINCT re-entrancy guards, do not conflate:
 *   1. `dismissedAttemptRef` — mobile-verbatim (editor.tsx :152-157).
 *      Guards ONLY the post-success side-effect block (track + clear +
 *      markSubmissionInFlight + navigate) against firing twice for the
 *      same submission id if a re-render hits this path again before
 *      navigation completes.
 *   2. In-flight double-click guard — Web delta, NOT in mobile. A
 *      synchronous `useRef` checked at the very top of
 *      `handleConfirmSubmit`, before any `await` and before React's
 *      `disabled`-attribute DOM update lands, so a rapid double/triple
 *      click on "Envoyer" inside a single event-loop turn cannot fire
 *      `submitWriting` more than once. Same idiom as
 *      `CustomPromptScreen.handleSubmit`'s `isSubmittingRef`
 *      precedent.
 *
 * P4: `rate_limit_exceeded`'s `retry_after_seconds` is always `undefined`
 * on web (`writingErrors.ts` — `ApiError` carries no response headers),
 * so the minutes-interpolated copy branch below is unreachable in
 * practice; it's kept for parity with mobile's helper shape and renders
 * the `messageFallback` copy, with NO retry CTA (a cooldown a retry
 * button can't shortcut).
 *
 * P5: success has no toast (mobile shows one) — this screen redirects to
 * `/{locale}/app/schreiben?submitted=1`, which `PromptListScreen`
 * (Task 6.6) already renders as an inline auto-dismissing banner.
 *
 * Constraint 15 (binding): feature code imports wire functions ONLY from
 * `@/learner/core/api/examApi`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useTranslation } from "react-i18next";

import { AppButton, AppText, EmptyState, Skeleton, Textarea } from "@/learner/ui/primitives";

import {
  listPrompts,
  logSubmitError,
  submitWriting,
  type SubmitError,
  type WritingPrompt,
} from "@/learner/core/api/examApi";
import { hydrateExamContext, useExamContextStore } from "@/learner/core/exam/examContext";
import { countWords } from "@/learner/core/util/wordCount";
import { markSubmissionInFlight } from "@/learner/core/readiness";
import { trackEvent } from "@/learner/core/analytics/posthog";

import { useDraft } from "../hooks/useDraft";

export interface SchreibenEditorScreenProps {
  readonly promptId: string;
}

/** CSS custom-property tokens (no hex literals) driving the word-count colour. */
const COLOR_AMBER = "var(--color-priority-amber)";
const COLOR_DANGER = "var(--color-warning-red)";
const COLOR_SUCCESS = "var(--color-success-green)";
const COLOR_NEUTRAL = "var(--color-text-tertiary)";

export function SchreibenEditorScreen({ promptId }: SchreibenEditorScreenProps) {
  const router = useRouter();
  const locale = useLocale();
  const { t } = useTranslation(["writing", "schreiben"]);

  const board = useExamContextStore((s) => s.board);
  const level = useExamContextStore((s) => s.level);
  const isExamContextLoaded = useExamContextStore((s) => s.isLoaded);

  useEffect(() => {
    void hydrateExamContext();
  }, []);

  const [prompt, setPrompt] = useState<WritingPrompt | null>(null);
  const [loadingPrompt, setLoadingPrompt] = useState(true);
  const [promptMissing, setPromptMissing] = useState(false);
  const { body, setBody, clear, hydrated } = useDraft(promptId);
  const [submitting, setSubmitting] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [submitError, setSubmitError] = useState<SubmitError | null>(null);

  // F8 guard #1 — mobile-verbatim: suppresses a duplicate POST-SUCCESS
  // side-effect run for the same submission id (editor.tsx :152-157).
  const dismissedAttemptRef = useRef<string | null>(null);
  // F8 guard #2 — Web delta: synchronous in-flight guard against a
  // double/triple-click on the confirm CTA firing `submitWriting` more
  // than once. Checked ahead of the `disabled` attribute's render.
  const inFlightRef = useRef(false);
  const draftInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isExamContextLoaded) return;
    let cancelled = false;
    (async () => {
      setLoadingPrompt(true);
      setPromptMissing(false);
      try {
        const rows = await listPrompts(board, level);
        if (cancelled) return;
        const found = rows.find((p) => p.id === promptId) ?? null;
        setPrompt(found);
        setPromptMissing(found === null);
      } catch {
        // Web delta: mobile lets a fetch failure fall through to a
        // degraded (unsubmittable, prompt-less) editor. Here it's
        // indistinguishable from "not found" — both need a real prompt
        // row to render the task card / word bounds — so this renders
        // the same not-found error state with a back CTA.
        if (!cancelled) {
          setPrompt(null);
          setPromptMissing(true);
        }
      } finally {
        if (!cancelled) setLoadingPrompt(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isExamContextLoaded, board, level, promptId]);

  const wordCount = useMemo(() => countWords(body), [body]);

  const countColor = useMemo((): string => {
    if (!prompt) return COLOR_NEUTRAL;
    if (wordCount > prompt.max_words) return COLOR_AMBER;
    if (wordCount < prompt.min_words) return COLOR_DANGER;
    return COLOR_SUCCESS;
  }, [prompt, wordCount]);

  const canSubmit = useMemo(() => {
    if (!prompt || submitting) return false;
    return wordCount >= prompt.min_words && wordCount <= prompt.max_words;
  }, [prompt, submitting, wordCount]);

  // Clear a stale error banner the moment the learner keeps typing —
  // mobile-verbatim rationale (editor.tsx :105-116).
  const handleBodyChange = useCallback(
    (next: string): void => {
      setBody(next);
      setSubmitError((prev) => (prev ? null : prev));
    },
    [setBody]
  );

  const handleSubmitTap = useCallback((): void => {
    if (!prompt || submitting) return;
    setSubmitError(null);
    setConfirmVisible(true);
  }, [prompt, submitting]);

  const handleCancelConfirm = useCallback((): void => {
    setConfirmVisible(false);
  }, []);

  const handleConfirmSubmit = useCallback(async (): Promise<void> => {
    // F8 guard #2 (Web delta) — synchronous, ahead of the `disabled`
    // attribute's render; see module doc comment.
    if (inFlightRef.current || !prompt) return;
    inFlightRef.current = true;
    setSubmitError(null);
    setConfirmVisible(false);
    setSubmitting(true);
    try {
      const result = await submitWriting({ promptId, bodyDe: body });
      if (!result.ok) {
        logSubmitError(result.error);
        setSubmitError(result.error);
        return;
      }
      const res = result.value;
      const attemptKey = res.id ?? "pending";

      // F8 guard #1 (mobile-verbatim).
      if (dismissedAttemptRef.current === attemptKey) return;
      dismissedAttemptRef.current = attemptKey;

      trackEvent("writing_draft_submitted", {
        prompt_id: promptId,
        word_count: wordCount,
        action: "submitted-optimistic",
      });

      await clear();

      markSubmissionInFlight(res.id, "schreiben");

      // P5: no toast — redirect straight to the prompt list, which
      // renders `?submitted=1` as an inline auto-dismissing banner
      // (Task 6.6, `PromptListScreen`).
      router.replace(`/${locale}/app/schreiben?submitted=1`);
    } catch (err) {
      const fallback: SubmitError = { kind: "network" };
      logSubmitError(fallback);
      if (typeof console !== "undefined" && typeof console.warn === "function") {
        console.warn(
          "[writing-submit] unexpected throw",
          err instanceof Error ? err.message : String(err)
        );
      }
      setSubmitError(fallback);
    } finally {
      setSubmitting(false);
      inFlightRef.current = false;
    }
  }, [body, clear, locale, prompt, promptId, router, wordCount]);

  if (!isExamContextLoaded || loadingPrompt || !hydrated) {
    return (
      <div
        className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8 lg:px-8"
        data-testid="schreiben-editor-loading"
      >
        <Skeleton.Card />
        <Skeleton.Card />
      </div>
    );
  }

  if (promptMissing || !prompt) {
    return (
      <div
        className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8 lg:px-8"
        data-testid="schreiben-editor-not-found"
      >
        <EmptyState
          title={t("writing:composer.promptNotFound.title")}
          description={t("writing:composer.promptNotFound.body")}
          actionLabel={t("writing:composer.promptNotFound.cta")}
          onAction={() => router.push(`/${locale}/app/schreiben`)}
        />
      </div>
    );
  }

  const overline = t("schreiben:editor.overline", {
    skill: t("schreiben:editor.skill"),
    level: prompt.exam_board.toUpperCase().includes("B2") ? "B2" : "B1",
    teil: prompt.teil,
  });

  const wordCountLabel = t("schreiben:editor.wordPill", {
    count: wordCount,
    min: prompt.min_words,
    max: prompt.max_words,
  });

  // Live too-short / too-long hint under the word counter (mobile #359).
  const wordHint =
    wordCount < prompt.min_words
      ? t("writing:composer.wordHint.tooShort", { count: prompt.min_words - wordCount })
      : wordCount > prompt.max_words
        ? t("writing:composer.wordHint.tooLong", { count: wordCount - prompt.max_words })
        : null;

  return (
    <div
      data-testid="schreiben-editor"
      className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6 lg:px-8"
    >
      {/*
       * Sticky error banner — rendered ABOVE the scroll/content area, not
       * inside it (mobile #367 rationale: the language-guard warning must
       * stay visible regardless of scroll position).
       */}
      {submitError ? (
        <div
          role="alert"
          data-testid="schreiben-error"
          className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-warning-red bg-bg-card p-4"
        >
          <AppText tone="warning" size="small" testID={`schreiben-error-${submitError.kind}`}>
            {renderSubmitErrorMessage(t, submitError, prompt)}
          </AppText>
          {renderSubmitErrorCta(t, submitError, {
            onFocusDraft: () => {
              setSubmitError(null);
              draftInputRef.current?.focus();
            },
            onClearError: () => setSubmitError(null),
          })}
        </div>
      ) : null}

      <div className="flex flex-col gap-4">
        <AppText
          tone="tertiary"
          size="caption"
          weight="semi"
          align="center"
          testID="schreiben-overline"
        >
          {overline.toUpperCase()}
        </AppText>

        <div className="flex items-center justify-between gap-2">
          <AppText
            as="h1"
            family="serif"
            size="h2"
            weight="bold"
            align="center"
            className="flex-1"
            testID="schreiben-title"
          >
            {prompt.title_de}
          </AppText>
          <div
            aria-label={wordCountLabel}
            data-testid="schreiben-word-pill"
            className="flex items-baseline gap-0.5 rounded-full border border-accent-gold px-3 py-0.5"
          >
            <AppText tone="gold" size="small" weight="semi" numeric>
              {wordCount}
            </AppText>
            <AppText tone="tertiary" size="small" weight="semi" numeric>
              {` / ${prompt.min_words}–${prompt.max_words}`}
            </AppText>
          </div>
        </div>

        <div
          data-testid="schreiben-task-card"
          aria-label={`${t("schreiben:editor.taskOverline")} ${prompt.situation_de}`}
          className="flex flex-col gap-1 rounded-[var(--radius-md)] bg-bg-content p-4"
        >
          <AppText tone="tertiary" size="caption" weight="semi">
            {t("schreiben:editor.taskOverline").toUpperCase()}
          </AppText>
          <AppText size="body" family="serif" className="mt-0.5 italic">
            {`« ${prompt.situation_de} »`}
          </AppText>
          {prompt.bullet_points.length > 0 ? (
            <ul className="mt-1 flex flex-col gap-0.5">
              {prompt.bullet_points.map((bp, idx) => (
                <li key={`bp-${idx}`}>
                  <AppText size="small" tone="secondary">
                    {"• "}
                    {bp}
                  </AppText>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <Textarea
          ref={draftInputRef}
          value={body}
          onChange={(e) => handleBodyChange(e.target.value)}
          placeholder={t("writing:composer.placeholder")}
          aria-label={t("schreiben:editor.draftA11y")}
          testID="schreiben-draft-input"
          minHeight={220}
        />

        <div className="flex items-center justify-between">
          <AppText
            size="caption"
            weight="semi"
            testID="schreiben-word-count"
            style={{ color: countColor }}
          >
            {t("writing:composer.wordCount", { count: wordCount })}
          </AppText>
          <AppText tone="tertiary" size="caption">
            {t("writing:composer.range", { min: prompt.min_words, max: prompt.max_words })}
          </AppText>
        </div>

        {wordHint ? (
          <AppText
            size="caption"
            weight="semi"
            testID="schreiben-word-hint"
            style={{ color: countColor }}
          >
            {wordHint}
          </AppText>
        ) : null}

        <AppButton
          label={t("schreiben:editor.submit")}
          onClick={handleSubmitTap}
          disabled={!canSubmit}
          testID="schreiben-submit"
          className="mt-2"
        />
      </div>

      {confirmVisible ? (
        <div
          role="dialog"
          aria-modal="true"
          data-testid="schreiben-confirm-submit"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-premium-black)]/60 px-6"
          onClick={handleCancelConfirm}
        >
          <div
            className="flex w-full max-w-md flex-col gap-4 rounded-[var(--radius-md)] border border-line-subtle bg-bg-card p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <AppText size="h3" weight="bold" family="serif">
              {t("writing:composer.confirmSubmit.title")}
            </AppText>
            <AppText tone="secondary" size="body">
              {t("writing:composer.confirmSubmit.body")}
            </AppText>
            <div className="mt-2 flex gap-3">
              <AppButton
                label={t("writing:composer.confirmSubmit.cancel")}
                onClick={handleCancelConfirm}
                variant="outline"
                testID="schreiben-confirm-cancel"
                className="flex-1"
              />
              <AppButton
                label={t("writing:composer.confirmSubmit.confirm")}
                onClick={() => void handleConfirmSubmit()}
                loading={submitting}
                testID="schreiben-confirm-confirm"
                className="flex-1"
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-kind error rendering helpers — ported from mobile
// `SchreibenEditorScreen.tsx :637-764` (`renderSubmitErrorMessage` +
// `renderSubmitErrorCta`). Kept outside the component, same rationale as
// mobile: testable in isolation, no re-creation on every render.
// ---------------------------------------------------------------------------

type TFn = (key: string, vars?: Record<string, unknown>) => string;

function renderSubmitErrorMessage(t: TFn, err: SubmitError, prompt: WritingPrompt | null): string {
  switch (err.kind) {
    case "network":
      return t("writing:composer.errors.network.message");
    case "body_language_not_german":
      return t("writing:composer.errors.body_language_not_german.message");
    case "too_short": {
      const min = err.min ?? prompt?.min_words;
      return t("writing:composer.errors.tooShort", { min });
    }
    case "too_long": {
      const max = err.max ?? prompt?.max_words;
      return t("writing:composer.errors.tooLong", { max });
    }
    case "rate_limit_exceeded": {
      // P4 / Web delta: `retry_after_seconds` is always `undefined` on
      // web (`writingErrors.ts` — `ApiError` carries no response
      // headers), so this branch always falls through to
      // `messageFallback`. Kept for parity with mobile's helper shape.
      if (err.retry_after_seconds && err.retry_after_seconds > 0) {
        const minutes = Math.max(1, Math.round(err.retry_after_seconds / 60));
        return t("writing:composer.errors.rate_limit_exceeded.message", { minutes });
      }
      return t("writing:composer.errors.rate_limit_exceeded.messageFallback");
    }
    case "idempotency_replay":
      return t("writing:composer.errors.idempotency_replay.message");
    case "validation_failed":
      return t("writing:composer.errors.validation_failed.message");
    case "server":
      return t("writing:composer.errors.server.message");
    case "unknown":
    default:
      return t("writing:composer.errors.unknown.message");
  }
}

type SubmitErrorCtaHandlers = {
  readonly onFocusDraft: () => void;
  readonly onClearError: () => void;
};

function renderSubmitErrorCta(
  t: TFn,
  err: SubmitError,
  handlers: SubmitErrorCtaHandlers
): ReactElement | null {
  switch (err.kind) {
    case "body_language_not_german":
      return (
        <AppButton
          label={t("writing:composer.errors.body_language_not_german.cta")}
          variant="outline"
          onClick={handlers.onFocusDraft}
          testID="schreiben-error-cta-open-draft"
          className="self-start"
        />
      );
    case "rate_limit_exceeded":
      // P4 — no CTA; the cooldown lifts on its own.
      return null;
    case "network":
      return (
        <AppButton
          label={t("writing:composer.errors.network.cta")}
          variant="outline"
          onClick={handlers.onClearError}
          testID="schreiben-error-cta-retry"
          className="self-start"
        />
      );
    case "server":
      return (
        <AppButton
          label={t("writing:composer.errors.server.cta")}
          variant="outline"
          onClick={handlers.onClearError}
          testID="schreiben-error-cta-retry"
          className="self-start"
        />
      );
    case "idempotency_replay":
      return (
        <AppButton
          label={t("writing:composer.errors.idempotency_replay.cta")}
          variant="outline"
          onClick={handlers.onClearError}
          testID="schreiben-error-cta-view"
          className="self-start"
        />
      );
    case "validation_failed":
      return (
        <AppButton
          label={t("writing:composer.errors.validation_failed.cta")}
          variant="outline"
          onClick={handlers.onClearError}
          testID="schreiben-error-cta-retry"
          className="self-start"
        />
      );
    case "unknown":
      return (
        <AppButton
          label={t("writing:composer.errors.unknown.cta")}
          variant="outline"
          onClick={handlers.onClearError}
          testID="schreiben-error-cta-retry"
          className="self-start"
        />
      );
    default:
      return null;
  }
}
