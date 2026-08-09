"use client";

/**
 * `SprechenFeedbackScreen` — standalone, deep-linkable Sprechen v2
 * unified-grader feedback screen (S7 · Task 7.9). Web port of
 * `deutschfit-mobile/src/features/sprechen/screens/SprechenFeedbackScreen.tsx`
 * (1025L) + its feature-local `AnnotatedTranscript` block (this repo's port
 * at `../components/AnnotatedTranscript.tsx`) — read both fully before
 * touching this file.
 *
 * Reachable from (P17, closed by this task):
 *   - `PerformanceHistoryScreen` sprechen-row taps (graded AND rejected).
 *   - `AccueilScreen.handleOpenReady` when the readiness signal's module is
 *     `"sprechen"`.
 * Distinct from the live session screen's (Task 7.8) done-phase inline
 * view — this screen is the durable, bookmarkable result surface.
 *
 * Status branches (driven by `useSprechenSubmissionPolling`, Task 7.4):
 *   - idle / awaiting_upload / queued / in_progress → in-flight fallback.
 *     The screen refuses to mount a real bilan while grading is still
 *     running; surfaces a calm "heading you back" message and auto-closes
 *     after `NON_GRADED_REDIRECT_MS` (1000ms) so the Accueil StatusStrip
 *     owns the wait UX (mobile parity, P4).
 *   - timeout — 240s wall-clock budget exhausted client-side (the poller's
 *     own budget, Task 7.4) → poll_exhausted copy.
 *   - rejected (P9) — backend deterministically refused the recording.
 *     Branches on `error_message`: `language_not_german`;
 *     `duration_too_short` / `transcript_too_short` (share one surface —
 *     same product event); unknown/other → generic.
 *   - failed / error → generic failure copy.
 *   - graded && !isFeedbackV2(feedback_json) → legacy banner, no bilan
 *     (pre-v2 rows are not reconstructed).
 *   - graded v2 → full bilan (`SprechenFeedbackGradedView` below).
 *
 * Graded layout (mirrors mobile's Option C, founding-doc §17 +
 * brand-voice §11):
 *   - `BandPill` (solide / proche_du_seuil / a_retravailler) + a
 *     monologue-type `MetaChip`.
 *   - Blocked-reason banner when `feedback_blocked_reason !== null`.
 *   - "Vu par le Prüfer" examiner card: weights recap
 *     (`DIMENSION_ORDER` × `metadata.weights_applied`) + one
 *     `DimensionRow` per dimension (score + locale-aware justification).
 *   - `AudioReplayButton` (Task 7.3) for the learner's own recording.
 *   - `AnnotatedTranscript` with `flattenEvidenceSpans` — evidence spans
 *     from all five dimensions, sorted by `transcript_offset_start`.
 *   - "Côté Betreuer" card: headline + strengths/growth bullets +
 *     "Prochaines étapes" (`next_steps`, locale-aware label).
 *
 * Route split (S6/S7 established pattern — `FeedbackScreen`/
 * `SchreibenEditorScreen`): `submissionId` is a PROP the page component
 * reads from the dynamic `[submissionId]` segment, not `useParams()` here
 * directly — keeps this screen testable without mocking
 * `next/navigation`'s `useParams`.
 *
 * `acknowledgeReadiness({ submissionId, module: "sprechen", acknowledgedAt })`
 * fires once per mount on the `graded` transition (`clearedRef` guard,
 * mobile-verbatim placement — BEFORE the branch returns, so it also fires
 * for a legacy (non-v2) graded row, matching mobile).
 *
 * Web deltas from mobile (see also inline `// Web delta:` comments):
 *   - F10 (S6 precedent): the root `sprechen-feedback-screen` testID sits
 *     on EVERY branch, including failed/error — mobile's FAILED branch
 *     omits it (`SprechenFeedbackScreen.tsx:479-497` on mobile carries the
 *     same gap `FeedbackScreen.tsx:246-247` has on the writing side).
 *   - No React Navigation stack: "close"-style CTAs (skeleton close,
 *     timeout/failed/rejected-secondary retry, legacy close) call
 *     `router.back()` — same semantics as mobile's single
 *     `handleClose = () => navigation.goBack()` used everywhere except the
 *     graded footer. The graded footer's "Terminer" CTA is the one
 *     explicit deviation (brief-mandated): it routes to `/{locale}/app`
 *     (mobile: `goBack()` on a root-modal stack) — a *successful* result
 *     sends the learner home, matching the Schreiben Feedback screen's
 *     Home CTA; every other (non-terminal / dead-end) branch returns the
 *     learner to wherever they tapped in from (History row / Accueil
 *     pulse) so they can retry immediately.
 *   - Retake (`handleRefaire`) clears `useTopicHandoff` (Task 7.6 store)
 *     before routing to `/{locale}/app/sprechen`, so the picker never
 *     resurrects a stale handoff topic from a previous session (mobile:
 *     cross-tab `navigation.navigate` into the TopicPicker, no analogous
 *     handoff store to clear).
 *   - `BandPill`'s `a_retravailler` band reuses `AppText`'s "warning" tone
 *     for its label color (paired with `bg-error-subtle`) — `AppText` has
 *     no "error" tone (mobile's `theme.errorText` has no wired web
 *     equivalent). Same substitution `StatusStrip.tsx`'s "failed" palette
 *     already uses (`background: bg-error-subtle, tone: "warning"`).
 *   - No `FooterDock` (mobile-only sticky-bottom primitive) — footer CTAs
 *     render inline at the bottom of the scroll content, same idiom the
 *     Schreiben Feedback screen established.
 *   - Constraint 9 — mobile's `SprechenFeedbackScreen` has no
 *     `listPrompts`-style secondary fetch to gate behind a one-shot ref
 *     guard (confirmed against the full mobile source: it reads
 *     everything it needs straight off the polled `feedback_json`, unlike
 *     Schreiben's screen which separately resolves the prompt title/exam
 *     badge). There is therefore no analogous guard-reset bug class to
 *     replicate or fix here; the "failed fetch then a retry" regression
 *     test in this task's suite instead exercises the poller's own
 *     already-built resilience (Task 7.4 — `createSprechenPoller`'s
 *     `tick()` never sets `stopped` on a transport error, so the next
 *     tick still fires) surfacing correctly through this screen.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useTranslation } from "react-i18next";
import clsx from "clsx";

import { AppButton, AppText, Card, EmptyState } from "@/learner/ui/primitives";
import {
  isFeedbackV2,
  type Band,
  type DimensionKey,
  type DimensionScore,
  type FeedbackBlockedReason,
  type FeedbackV2,
} from "@/learner/core/feedback/feedbackV2";
import { acknowledgeReadiness } from "@/learner/core/readiness";

import { AnnotatedTranscript, type AnnotatedEvidenceSpan } from "../components/AnnotatedTranscript";
import { AudioReplayButton } from "../components/AudioReplayButton";
import { useSprechenSubmissionPolling } from "../hooks/useSprechenSubmissionPolling";
import { useTopicHandoff } from "../topicHandoffStore";

export interface SprechenFeedbackScreenProps {
  readonly submissionId: string;
}

/**
 * P4 (async-result-experience plan, mobile-verbatim value) — how long the
 * in-flight fallback view sits on screen before we auto-close. Short
 * enough that the bounce feels intentional, long enough that the learner
 * can read the body line.
 */
const NON_GRADED_REDIRECT_MS = 1000;

const DIMENSION_ORDER: readonly DimensionKey[] = [
  "aufgabe",
  "kohaerenz",
  "wortschatz",
  "grammatik",
  "aussprache",
];

interface BandStyle {
  readonly bg: string;
  readonly tone: "success" | "warning";
}

const BAND_STYLES: Record<Band, BandStyle> = {
  solide: { bg: "bg-success-subtle", tone: "success" },
  proche_du_seuil: { bg: "bg-warning-subtle", tone: "warning" },
  // Web delta: no "error" AppText tone — reuses "warning" text color paired
  // with the error-tinted background, same substitution StatusStrip's
  // "failed" palette already uses.
  a_retravailler: { bg: "bg-error-subtle", tone: "warning" },
};

function flattenEvidenceSpans(feedback: FeedbackV2): readonly AnnotatedEvidenceSpan[] {
  const out: AnnotatedEvidenceSpan[] = [];
  for (const dimension of DIMENSION_ORDER) {
    const score: DimensionScore = feedback.dimension_scores[dimension];
    for (const span of score.evidence_spans) {
      out.push({
        transcript_offset_start: span.transcript_offset_start,
        transcript_offset_end: span.transcript_offset_end,
        quote_de: span.quote_de,
        label: span.label,
        dimension,
        justification_fr: score.justification_fr,
      });
    }
  }
  return [...out].sort((a, b) => a.transcript_offset_start - b.transcript_offset_start);
}

interface DimensionRowProps {
  readonly dimension: DimensionKey;
  readonly score: DimensionScore;
  readonly justification: string;
  readonly testID?: string;
}

function DimensionRow({ dimension, score, justification, testID }: DimensionRowProps) {
  return (
    <div data-testid={testID} className="border-t border-line-soft py-2">
      <div className="flex items-center justify-between gap-2">
        <AppText family="sans" size="caption" tone="tertiary" className="uppercase tracking-wide">
          {dimension}
        </AppText>
        <AppText
          family="sans"
          size="body"
          weight="semi"
          tone="primary"
          numeric
          testID={testID ? `${testID}-score` : undefined}
        >
          {`${score.score} / 100`}
        </AppText>
      </div>
      <AppText family="sans" size="small" tone="secondary" className="mt-1">
        {justification}
      </AppText>
    </div>
  );
}

interface BandPillProps {
  readonly band: Band;
  readonly label: string;
  readonly testID?: string;
}

function BandPill({ band, label, testID }: BandPillProps) {
  const style = BAND_STYLES[band];
  return (
    <div data-testid={testID} className={clsx("rounded-[var(--radius-full)] px-4 py-1", style.bg)}>
      <AppText tone={style.tone} size="caption" weight="semi" className="uppercase tracking-wide">
        {label}
      </AppText>
    </div>
  );
}

interface MetaChipProps {
  readonly label: string;
  readonly testID?: string;
}

/** Neutral context chip — surfaces the graded monologue type. */
function MetaChip({ label, testID }: MetaChipProps) {
  return (
    <div
      data-testid={testID}
      className="rounded-[var(--radius-full)] border border-line-soft bg-bg-card px-4 py-1"
    >
      <AppText
        family="sans"
        size="caption"
        weight="semi"
        tone="secondary"
        className="uppercase tracking-wide"
        testID={testID ? `${testID}-label` : undefined}
      >
        {label}
      </AppText>
    </div>
  );
}

export function SprechenFeedbackScreen({ submissionId }: SprechenFeedbackScreenProps) {
  const router = useRouter();
  const locale = useLocale();
  const { t, i18n } = useTranslation("sprechen");
  const isGerman = i18n.language?.toLowerCase().startsWith("de") ?? false;

  const { data, status } = useSprechenSubmissionPolling(submissionId);

  // Readiness state-machine ack — clear the slot once Marie lands on a
  // real graded result so the single-slot guard unblocks the next submit.
  // Idempotent across re-renders (mobile-verbatim placement — before the
  // branch returns, so a legacy (non-v2) graded row also clears the slot).
  const clearedRef = useRef(false);
  useEffect(() => {
    if (status === "graded" && !clearedRef.current) {
      clearedRef.current = true;
      acknowledgeReadiness({
        submissionId,
        module: "sprechen",
        acknowledgedAt: Date.now(),
      });
    }
  }, [status, submissionId]);

  // P4 — refuse to mount the feedback bilan while grading is still in
  // flight. Non-terminal statuses surface a calm "heading you back" view
  // and auto-close after 1s so the Accueil StatusStrip takes over the wait
  // UX. Without this guard a deep-link race (push → screen mounts before
  // the poller resolves) would render an empty bilan.
  const isInFlightStatus =
    status === "idle" ||
    status === "awaiting_upload" ||
    status === "queued" ||
    status === "in_progress";
  //
  // Web delta (StrictMode correctness fix — the guard must live INSIDE the
  // timer callback, not around the `setTimeout` call): gating the
  // `setTimeout` itself on `redirectFiredRef.current` would break under
  // React 18 dev StrictMode's mount → cleanup → remount double-invoke —
  // pass 1 schedules timer 1 and flips the ref; the synthetic cleanup
  // cancels timer 1; pass 2 sees the ref already tripped and schedules
  // nothing, leaving the screen with NO live timer and the auto-back never
  // firing at all. Checking the ref inside the callback instead means both
  // passes schedule their own timer, the synthetic cleanup cancels pass
  // 1's, and pass 2's timer survives to fire exactly once.
  const redirectFiredRef = useRef(false);
  useEffect(() => {
    if (!isInFlightStatus) return;
    const timer = setTimeout(() => {
      if (redirectFiredRef.current) return;
      redirectFiredRef.current = true;
      router.back();
    }, NON_GRADED_REDIRECT_MS);
    return () => clearTimeout(timer);
  }, [isInFlightStatus, router]);

  // Cast: the wire `SprechenSubmission.feedback_json` type only fully
  // covers the legacy v1 shape; the v2 unified-grader payload is the
  // structured `FeedbackV2` envelope. Gate every read through
  // `isFeedbackV2()` before treating it as v2 (mobile-verbatim cast site).
  const feedback = (data?.feedback_json ?? null) as unknown as FeedbackV2 | null;
  const isV2 = isFeedbackV2(feedback);

  // "Close"-style exit — every branch except the graded footer's
  // "Terminer" CTA returns the learner to wherever they tapped in from
  // (History row / Accueil pulse), mirroring mobile's single
  // `handleClose = () => navigation.goBack()`.
  const handleBack = useCallback((): void => {
    router.back();
  }, [router]);

  // Graded-only "Terminer" exit — a successful result sends the learner
  // home, matching the Schreiben Feedback screen's Home CTA (Web delta,
  // see file-level doc comment).
  const handleGoHome = useCallback((): void => {
    router.push(`/${locale}/app`);
  }, [router, locale]);

  const handleRefaire = useCallback((): void => {
    useTopicHandoff.getState().clear();
    router.push(`/${locale}/app/sprechen`);
  }, [router, locale]);

  if (isInFlightStatus) {
    return (
      <div
        data-testid="sprechen-feedback-screen"
        className="mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col items-center justify-center gap-4 px-4 py-16 text-center lg:px-8"
      >
        <div
          data-testid="sprechen-feedback-in-flight-fallback"
          className="flex flex-col items-center gap-2"
        >
          <AppText tone="primary" size="h2" family="serif" align="center">
            {t("feedbackScreen.inFlightFallback.title")}
          </AppText>
          <AppText tone="secondary" size="body" family="sans" align="center">
            {t("feedbackScreen.inFlightFallback.body")}
          </AppText>
        </div>
        <AppButton
          testID="sprechen-feedback-close-skeleton"
          label={t("feedbackScreen.backToHome")}
          onClick={handleBack}
          variant="outline"
        />
      </div>
    );
  }

  if (status === "timeout") {
    return (
      <div
        data-testid="sprechen-feedback-screen"
        className="mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col items-center justify-center gap-4 px-4 py-16 lg:px-8"
      >
        <EmptyState
          testID="sprechen-feedback-timeout"
          title={t("feedbackScreen.poll_exhausted.title")}
          description={t("feedbackScreen.poll_exhausted.body")}
          actionLabel={t("feedbackScreen.poll_exhausted.cta")}
          onAction={handleBack}
        />
      </div>
    );
  }

  // `rejected` (P9) — the backend deterministically refused the recording
  // (e.g. the language detector returned non-German). Not a transient
  // error; render a dedicated verdict card so Marie knows why no grade was
  // produced and what to do next. Branches on `error_message` to surface
  // language-specific copy when known, falling back to a calm generic
  // otherwise.
  if (status === "rejected") {
    const errorCode = data?.error_message ?? null;
    const isLanguageNotGerman = errorCode === "language_not_german";
    // Backend duration gate emits two distinct codes representing the same
    // product event ("your recording was too short to evaluate"):
    // `duration_too_short` (audio-leg gate, pre-LLM) and
    // `transcript_too_short` (edge-fn gate, post-transcribe). Both share
    // one i18n branch / one surface.
    const isTooShort = errorCode === "duration_too_short" || errorCode === "transcript_too_short";
    let branchKey: string;
    let rejectedTestID: string;
    if (isLanguageNotGerman) {
      branchKey = "feedbackScreen.rejected.languageNotGerman";
      rejectedTestID = "sprechen-feedback-rejected-language-not-german";
    } else if (isTooShort) {
      branchKey = "feedbackScreen.rejected.tooShort";
      rejectedTestID = "sprechen-feedback-rejected-too-short";
    } else {
      branchKey = "feedbackScreen.rejected.generic";
      rejectedTestID = "sprechen-feedback-rejected-generic";
    }
    return (
      <div
        data-testid="sprechen-feedback-screen"
        className="mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col items-center justify-center gap-4 px-4 py-16 lg:px-8"
      >
        <div data-testid={rejectedTestID} className="flex w-full flex-col items-center gap-4">
          <EmptyState
            testID="sprechen-feedback-rejected"
            title={t(`${branchKey}.title`)}
            description={t(`${branchKey}.body`)}
            actionLabel={t(`${branchKey}.primaryCta`)}
            onAction={handleRefaire}
          />
          <AppButton
            testID="sprechen-feedback-rejected-secondary"
            label={t(`${branchKey}.secondaryCta`)}
            onClick={handleBack}
            variant="outline"
          />
        </div>
      </div>
    );
  }

  if (status === "failed" || status === "error") {
    return (
      <div
        data-testid="sprechen-feedback-screen"
        className="mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col items-center justify-center gap-4 px-4 py-16 lg:px-8"
      >
        <EmptyState
          testID="sprechen-feedback-failed"
          title={t("feedbackScreen.failed.title")}
          description={t("feedbackScreen.failed.body")}
          actionLabel={t("feedbackScreen.failed.retry")}
          onAction={handleBack}
        />
      </div>
    );
  }

  // Legacy banner — graded but not v2. Surface the persistent banner and
  // skip the full bilan (no v1 holistic reconstruction, mobile-verbatim).
  if (!isV2 || feedback === null) {
    return (
      <div
        data-testid="sprechen-feedback-screen"
        className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6 lg:px-8"
      >
        <div
          data-testid="sprechen-feedback-legacy-banner"
          className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-line-soft bg-bg-card p-4"
        >
          <AppText as="h2" family="serif" size="h3" weight="bold" tone="primary">
            {t("feedbackScreen.legacy.title")}
          </AppText>
          <AppText tone="secondary" size="body" className="leading-6">
            {t("feedbackScreen.legacy.body")}
          </AppText>
        </div>
        <div className="mt-2 flex flex-col gap-3 border-t border-line-subtle pt-4 sm:flex-row">
          <AppButton
            testID="sprechen-feedback-retake-legacy"
            label={t("feedbackScreen.retake")}
            onClick={handleRefaire}
            className="flex-1"
          />
          <AppButton
            testID="sprechen-feedback-close-legacy"
            label={t("feedbackScreen.backToHome")}
            onClick={handleBack}
            variant="outline"
            className="flex-1"
          />
        </div>
      </div>
    );
  }

  // Graded v2 path.
  return (
    <SprechenFeedbackGradedView
      feedback={feedback}
      isGerman={isGerman}
      submissionId={submissionId}
      onRefaire={handleRefaire}
      onClose={handleGoHome}
    />
  );
}

interface GradedViewProps {
  readonly feedback: FeedbackV2;
  readonly isGerman: boolean;
  readonly submissionId: string;
  readonly onRefaire: () => void;
  readonly onClose: () => void;
}

function SprechenFeedbackGradedView({
  feedback,
  isGerman,
  submissionId,
  onRefaire,
  onClose,
}: GradedViewProps) {
  const { t } = useTranslation("sprechen");
  const evidenceSpans = useMemo(() => flattenEvidenceSpans(feedback), [feedback]);

  const blockedReason: FeedbackBlockedReason | null = feedback.feedback_blocked_reason;
  const summaryHeadline = isGerman ? feedback.summary.headline_de : feedback.summary.headline_fr;
  const summaryStrengths = isGerman ? feedback.summary.strengths_de : feedback.summary.strengths_fr;
  const summaryGrowthAreas = isGerman
    ? feedback.summary.growth_areas_de
    : feedback.summary.growth_areas_fr;

  // Per-dimension weighting recap — surfaces why the composite score is
  // not the plain average of the five dimension scores.
  const weightsRecap = useMemo(() => {
    const weights = feedback.metadata.weights_applied;
    return DIMENSION_ORDER.map(
      (dimension) => `${dimension} ${Math.round(weights[dimension] * 100)} %`
    ).join("   ·   ");
  }, [feedback.metadata.weights_applied]);

  return (
    <div
      data-testid="sprechen-feedback-screen"
      className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6 lg:px-8"
    >
      {/* Band pill + monologue-type chip — overall verdict and the graded
          task type at a glance. */}
      <div className="flex flex-wrap items-center gap-2">
        <BandPill
          band={feedback.band}
          label={t(`feedbackScreen.band.${feedback.band}`)}
          testID="sprechen-feedback-band"
        />
        <MetaChip
          label={t(`feedbackScreen.monologueType.${feedback.monologue_type}`)}
          testID="sprechen-feedback-monologue-chip"
        />
      </div>

      {/* Blocked-reason banner — when the grader returned a structural
          block, surface the reason line above the bilan. */}
      {blockedReason !== null ? (
        <div
          data-testid="sprechen-feedback-blocked-banner"
          className="rounded-[var(--radius-md)] border border-line-soft bg-warning-subtle p-4"
        >
          <AppText tone="warning" size="small">
            {t(`feedbackScreen.blockedReason.${blockedReason}`)}
          </AppText>
        </div>
      ) : null}

      {/* Examiner (Prüfer) card — per-dimension scores. */}
      <Card
        elevated
        padded
        testID="sprechen-feedback-examiner-card"
        className="flex flex-col gap-2"
      >
        <AppText as="h2" family="serif" size="h3" weight="bold" tone="primary">
          {t("feedbackScreen.examiner.title")}
        </AppText>
        <AppText family="sans" size="caption" tone="tertiary" className="uppercase tracking-wide">
          {t("feedbackScreen.examiner.dimensionNote")}
        </AppText>
        <div className="flex flex-col gap-1">
          <AppText
            family="sans"
            size="caption"
            weight="semi"
            tone="tertiary"
            className="uppercase tracking-wide"
          >
            {t("feedbackScreen.examiner.weightsTitle")}
          </AppText>
          <AppText
            family="sans"
            size="small"
            tone="secondary"
            numeric
            testID="sprechen-feedback-weights-recap"
          >
            {weightsRecap}
          </AppText>
        </div>
        {DIMENSION_ORDER.map((dimension) => {
          const score = feedback.dimension_scores[dimension];
          const justification = isGerman ? score.justification_de : score.justification_fr;
          return (
            <DimensionRow
              key={dimension}
              dimension={dimension}
              score={score}
              justification={justification}
              testID={`sprechen-feedback-dimension-${dimension}`}
            />
          );
        })}
      </Card>

      {/* Audio replay — plays the learner's own submitted recording from a
          short-lived signed URL. */}
      <AudioReplayButton submissionId={submissionId} />

      {/* Annotated transcript — numbered evidence-span list under the
          transcript, flattened across the five dimensions and sorted by
          transcript offset. */}
      <AnnotatedTranscript
        testID="sprechen-feedback-transcript"
        transcript={feedback.asr_evidence.transcript}
        evidenceSpans={evidenceSpans}
        lowConfidenceSpans={feedback.asr_evidence.low_confidence_spans}
      />

      {/* Betreuer card — faceless in-app companion. Headline + strengths +
          growth-areas + next steps. */}
      <Card
        elevated
        padded
        testID="sprechen-feedback-betreuer-card"
        className="flex flex-col gap-2"
      >
        <AppText as="h2" family="serif" size="h3" weight="bold" tone="primary">
          {t("feedbackScreen.betreuer.title")}
        </AppText>
        <AppText
          family="sans"
          size="body"
          weight="medium"
          tone="primary"
          testID="sprechen-feedback-headline"
        >
          {summaryHeadline}
        </AppText>
        {summaryStrengths.length > 0 ? (
          <div className="flex flex-col gap-1">
            {summaryStrengths.map((line, index) => (
              <div
                key={`strength-${index}`}
                data-testid={`sprechen-feedback-strength-${index}`}
                className="flex items-start gap-2"
              >
                <AppText family="sans" size="body" tone="secondary">
                  {"·"}
                </AppText>
                <AppText family="sans" size="body" tone="secondary" className="flex-1">
                  {line}
                </AppText>
              </div>
            ))}
          </div>
        ) : null}
        {summaryGrowthAreas.length > 0 ? (
          <div className="flex flex-col gap-1">
            {summaryGrowthAreas.map((line, index) => (
              <div
                key={`growth-${index}`}
                data-testid={`sprechen-feedback-growth-${index}`}
                className="flex items-start gap-2"
              >
                <AppText family="sans" size="body" tone="secondary">
                  {"·"}
                </AppText>
                <AppText family="sans" size="body" tone="secondary" className="flex-1">
                  {line}
                </AppText>
              </div>
            ))}
          </div>
        ) : null}
        {feedback.next_steps.length > 0 ? (
          <div className="mt-2 flex flex-col gap-1">
            <AppText
              family="sans"
              size="caption"
              weight="semi"
              tone="tertiary"
              className="uppercase tracking-wide"
            >
              {t("feedbackScreen.betreuer.nextStepsTitle")}
            </AppText>
            {feedback.next_steps.map((step, index) => {
              const label = isGerman ? step.label_de : step.label_fr;
              return (
                <div
                  key={step.id}
                  data-testid={`sprechen-feedback-next-step-${index}`}
                  className="flex items-start gap-2"
                >
                  <AppText family="sans" size="body" tone="primary">
                    {"·"}
                  </AppText>
                  <AppText family="sans" size="body" tone="primary" className="flex-1">
                    {label}
                  </AppText>
                </div>
              );
            })}
          </div>
        ) : null}
      </Card>

      <div className="mt-2 flex flex-col gap-3 border-t border-line-subtle pt-4 sm:flex-row">
        <AppButton
          testID="sprechen-feedback-retake"
          label={t("feedbackScreen.retake")}
          onClick={onRefaire}
          className="flex-1"
        />
        <AppButton
          testID="sprechen-feedback-close"
          label={t("feedbackScreen.backToHome")}
          onClick={onClose}
          variant="outline"
          className="flex-1"
        />
      </div>
    </div>
  );
}
