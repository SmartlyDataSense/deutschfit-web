"use client";

/**
 * `AnnotatedTranscript` — web port of
 * `deutschfit-mobile/src/features/sprechen/components/AnnotatedTranscript.tsx`
 * (186L, verbatim structure). Pure presentation block for
 * `SprechenFeedbackScreen` (S7 · Task 7.9).
 *
 * Renders the ASR transcript plus a numbered list of evidence spans
 * underneath. Each numbered item shows the verbatim quote (straight double
 * quotes per brand-voice §7), the dimension key it belongs to, and the
 * Betreuer's French justification (`justification_fr`).
 *
 * Inline highlights inside the transcript are deferred to v1.1 (mobile
 * parity) — the numbered list is the bridge between transcript and grader
 * feedback.
 *
 * If `lowConfidenceSpans` is non-empty, a single italic line renders ABOVE
 * the transcript explaining that some passages are uncertain
 * (`t("feedbackScreen.asr.unreliableNote")`).
 *
 * Web delta: RN `View`/`StyleSheet` → `<div>` + Tailwind classes backed by
 * the shared design tokens (no hex literals); `AppText` maps to the same
 * `family`/`size`/`tone` contract mobile's primitive exposes.
 */
import { useTranslation } from "react-i18next";

import { AppText } from "@/learner/ui/primitives";
import type { DimensionKey, LowConfidenceSpan } from "@/learner/core/feedback/feedbackV2";

/**
 * Evidence span enriched at the call site with the parent dimension and the
 * Betreuer's French justification. The screen builds these by walking the
 * five `dimension_scores` entries and flattening their `evidence_spans`.
 */
export interface AnnotatedEvidenceSpan {
  readonly transcript_offset_start: number;
  readonly transcript_offset_end: number;
  readonly quote_de: string;
  readonly label: string;
  readonly dimension: DimensionKey;
  readonly justification_fr: string;
}

export interface AnnotatedTranscriptProps {
  readonly transcript: string;
  /**
   * Numbered evidence spans rendered below the transcript. Order is
   * preserved — callers should sort by `transcript_offset_start` if they
   * want spans to appear in narrative order.
   */
  readonly evidenceSpans: readonly AnnotatedEvidenceSpan[];
  /**
   * If non-empty, an italic note renders above the transcript to warn that
   * some passages were transcribed with low confidence.
   */
  readonly lowConfidenceSpans?: readonly LowConfidenceSpan[];
  readonly testID?: string;
}

export function AnnotatedTranscript({
  transcript,
  evidenceSpans,
  lowConfidenceSpans,
  testID,
}: AnnotatedTranscriptProps) {
  const { t } = useTranslation("sprechen");
  const hasUnreliable = lowConfidenceSpans !== undefined && lowConfidenceSpans.length > 0;

  return (
    <div
      data-testid={testID}
      className="flex flex-col gap-4 rounded-[var(--radius-lg)] bg-bg-card p-4"
    >
      {hasUnreliable ? (
        <AppText
          testID={testID ? `${testID}-unreliable-note` : undefined}
          tone="secondary"
          size="small"
          className="italic"
        >
          {t("feedbackScreen.asr.unreliableNote")}
        </AppText>
      ) : null}

      <AppText
        testID={testID ? `${testID}-transcript` : undefined}
        family="serif"
        size="body"
        tone="primary"
        className="leading-6"
      >
        {transcript}
      </AppText>

      {evidenceSpans.length > 0 ? (
        <div
          data-testid={testID ? `${testID}-evidence-list` : undefined}
          className="flex flex-col gap-4"
        >
          {evidenceSpans.map((span, index) => {
            const ordinal = `${index + 1}.`;
            // Straight double quotes per brand-voice §7 (in-app technical
            // requirement — font fallback handles them cleanly).
            const quoted = `"${span.quote_de}"`;
            return (
              <div
                key={`${span.dimension}-${span.transcript_offset_start}-${index}`}
                data-testid={testID ? `${testID}-evidence-item-${index}` : undefined}
                className="flex gap-2"
              >
                <AppText
                  family="sans"
                  weight="semi"
                  size="body"
                  tone="primary"
                  className="min-w-[20px]"
                >
                  {ordinal}
                </AppText>
                <div className="flex flex-1 flex-col gap-1">
                  <AppText family="serif" size="body" tone="primary" className="italic">
                    {quoted}
                  </AppText>
                  <AppText
                    family="sans"
                    size="caption"
                    tone="tertiary"
                    className="uppercase tracking-wide"
                  >
                    {span.dimension}
                  </AppText>
                  <AppText family="sans" size="small" tone="secondary">
                    {span.justification_fr}
                  </AppText>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
