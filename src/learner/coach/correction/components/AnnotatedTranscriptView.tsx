"use client";

/**
 * `AnnotatedTranscriptView` — Sprechen transcript with inline
 * evidence-span highlighting and a two-persona note panel (S9 · Task
 * 9.9). Web port of
 * `deutschfit-mobile/src/features/coach/correction/components/AnnotatedTranscriptView.tsx`.
 *
 * This is the correction-specific component with INLINE spans — do NOT
 * reuse `src/learner/sprechen/components/AnnotatedTranscript` (that
 * component's inline highlights are deferred to v1.1; it only renders a
 * numbered evidence list below the transcript).
 *
 * Contract note (mirrors mobile): `EvidenceSpan` carries only a short
 * `label`; the full `justificationDe` / `justificationFr` texts live at
 * the grading-dimension level and are passed as props, so any span click
 * reveals the dimension's overall verdict — the span pinpoints the
 * transcript location, the note panel explains the dimension's verdict.
 *
 * CRITICAL INVARIANT (see `../sprechenSpans.ts`'s header): `resolveSpans`
 * coalesces a span straddling a cut point into ONE highlight by comparing
 * `EvidenceSpan` OBJECT IDENTITY. `spans` reaches `resolveSpans` here with
 * NO copy/map/spread of its elements — passed straight through from the
 * `spans` prop. Do not clone the spans array's objects anywhere in this
 * file; doing so risks silently breaking the merge for any future caller
 * that (unlike this one) computes cut points and covering sets from
 * different arrays.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { EvidenceSpan } from "@/learner/core/feedback/feedbackV2";
import { AppText } from "@/learner/ui/primitives";

import { resolveSpans } from "../sprechenSpans";

export interface AnnotatedTranscriptViewProps {
  readonly transcript: string;
  readonly spans: readonly EvidenceSpan[];
  readonly justificationDe: string;
  readonly justificationFr: string;
  readonly testID?: string;
}

export function AnnotatedTranscriptView({
  transcript,
  spans,
  justificationDe,
  justificationFr,
  testID,
}: AnnotatedTranscriptViewProps) {
  const { t } = useTranslation(["coach"]);
  const [openLabel, setOpenLabel] = useState<string | null>(null);

  // `spans` flows straight into `resolveSpans` — no clone/map/spread here.
  const segments = resolveSpans(transcript, spans);

  return (
    <div className="flex flex-col gap-2" data-testid={testID}>
      <AppText tone="tertiary" size="small">
        {t("coach:correction.walkthrough.transcriptHint")}
      </AppText>

      <p className="text-body leading-6 text-text-primary">
        {segments.map((seg, idx) => {
          if (seg.type === "plain") {
            return <span key={idx}>{seg.text}</span>;
          }
          const label = seg.spans[0]?.label ?? `span-${idx}`;
          return (
            <button
              key={idx}
              type="button"
              onClick={() => setOpenLabel((cur) => (cur === label ? null : label))}
              data-testid={testID ? `${testID}-highlight-${idx}` : undefined}
              className="bg-error-subtle text-error-text line-through"
            >
              {seg.text}
            </button>
          );
        })}
      </p>

      {openLabel !== null ? (
        <div className="flex flex-col gap-2" data-testid={testID ? `${testID}-notes` : undefined}>
          <div className="rounded-[var(--radius-md)] border border-line-soft bg-bg-subtle p-4">
            <AppText tone="tertiary" size="caption" weight="semi">
              {t("coach:correction.walkthrough.examinerLabel")}
            </AppText>
            <AppText tone="primary" size="body">
              {justificationDe}
            </AppText>
          </div>
          <div className="rounded-[var(--radius-md)] border border-line-soft bg-coach-subtle p-4">
            <AppText tone="coach" size="caption" weight="semi">
              {t("coach:correction.walkthrough.betreuerLabel")}
            </AppText>
            <AppText tone="primary" size="body">
              {justificationFr}
            </AppText>
          </div>
        </div>
      ) : null}
    </div>
  );
}
