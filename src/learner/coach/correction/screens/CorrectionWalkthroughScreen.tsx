"use client";

/**
 * `CorrectionWalkthroughScreen` — read-only modality-branching correction
 * explainer (S9 · Task 9.9). Web port of
 * `deutschfit-mobile/src/features/coach/correction/screens/CorrectionWalkthroughScreen.tsx`.
 * Fetches stored correction data (no grader call — read-only over stored
 * data) and renders shared chrome (back header, `GlobalScoreBlock`, a
 * `DimensionCard` per dimension) plus the modality-specific layout:
 *   - Sprechen: `AnnotatedTranscriptView` per dimension WITH evidence
 *     spans, then a `DimensionCard` per dimension (all 5, regardless of
 *     whether they carry spans).
 *   - Schreiben: `SchreibenDiffView` (full-submission diff), then a
 *     `DimensionCard` per dimension (all 4).
 *
 * IMPORTANT — drill CTA is intentionally inert in this screen. Each
 * `DimensionCard` renders its "Travailler ce point" CTA but pressing it
 * does nothing (`onDrill` below is a no-op). `CoachDrillChain` requires
 * server-generated `{threadId, observationId, connectors, drills}` —
 * parameters the read-only walkthrough does not carry. Wiring
 * dimension-seeded drill entry is tracked in GitHub issue #416.
 *
 * Props (not `useParams()`): the dynamic route page
 * (`coach/correction/[modality]/[submissionId]/page.tsx`) reads and
 * validates the URL params via `isModality` (exported below) and passes
 * `{submissionId, modality}` down — same split as
 * `schreiben/feedback/[submissionId]/page.tsx` → `FeedbackScreen`, kept
 * testable without mocking `next/navigation`'s `useParams`/`notFound`.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";

import { Icon } from "@/learner/core/icons";
import { AppButton, AppText, EmptyState, Skeleton } from "@/learner/ui/primitives";
import type { DimensionKey } from "@/learner/core/feedback/feedbackV2";

import { fetchCorrection, type Correction, type Modality } from "../correctionApi";
import { GlobalScoreBlock } from "../components/GlobalScoreBlock";
import { DimensionCard } from "../components/DimensionCard";
import { AnnotatedTranscriptView } from "../components/AnnotatedTranscriptView";
import { SchreibenDiffView } from "../components/SchreibenDiffView";

// ---------------------------------------------------------------------------
// Route-param guard
// ---------------------------------------------------------------------------

/** Screen-level validator the dynamic route page calls before rendering
 * this screen — an unrecognised `modality` segment 404s via `notFound()`
 * rather than reaching `fetchCorrection` with a value it doesn't know. */
export function isModality(value: string): value is Modality {
  return value === "schreiben" || value === "sprechen";
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CorrectionWalkthroughScreenProps {
  readonly submissionId: string;
  readonly modality: Modality;
}

// ---------------------------------------------------------------------------
// Module-level dimension key lists
// ---------------------------------------------------------------------------

// NOTE: there is intentionally no `SCHREIBEN_DIMS` constant (issue #41
// defect 1). A hardcoded key list is exactly what silently dropped every
// telc row's dimension cards — the Schreiben branch below derives the
// rendered keys from `correction.dimensionScores` itself, board-blind by
// construction. `SPRECHEN_DIMS` stays a fixed list deliberately: the
// Sprechen path is out of scope for this fix (its 5 keys come from
// `FeedbackV2.dimension_scores`, a different, closed contract — see
// `correctionApi.ts`'s header).
const SPRECHEN_DIMS: readonly DimensionKey[] = [
  "aufgabe",
  "kohaerenz",
  "wortschatz",
  "grammatik",
  "aussprache",
];

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

type State = { phase: "loading" } | { phase: "error" } | { phase: "ready"; correction: Correction };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CorrectionWalkthroughScreen({
  submissionId,
  modality,
}: CorrectionWalkthroughScreenProps) {
  const router = useRouter();
  const { t } = useTranslation(["coach"]);

  const [state, setState] = useState<State>({ phase: "loading" });

  // `cancelled` is declared INSIDE the effect setup body (Constraint 12)
  // — a StrictMode double-invoke re-runs this closure fresh each time, so
  // there is no shared ref to go stale between setup→cleanup→setup.
  const load = useCallback(() => {
    let cancelled = false;
    setState({ phase: "loading" });
    fetchCorrection(submissionId, modality)
      .then((c) => {
        if (!cancelled) setState({ phase: "ready", correction: c });
      })
      .catch(() => {
        if (!cancelled) setState({ phase: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [submissionId, modality]);

  useEffect(() => {
    const cancel = load();
    return cancel;
  }, [load]);

  // Drill routing is intentionally not wired — see file header / GitHub
  // issue #416. `CoachDrillChain` requires a server-generated launch
  // payload the read-only walkthrough does not have.
  const onDrill = useCallback(() => {
    // no-op until the dimension-seeded drill entry lands (issue #416)
  }, []);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  let body: ReactNode;

  if (state.phase === "loading") {
    body = (
      <div className="flex flex-col gap-3" data-testid="correction-walkthrough-loading">
        <Skeleton.Card />
        <Skeleton.Card />
        <Skeleton.Card />
      </div>
    );
  } else if (state.phase === "error") {
    body = (
      <div className="flex flex-col items-center gap-3" data-testid="correction-walkthrough-error">
        <EmptyState
          title={t("coach:correction.walkthrough.error.title")}
          description={t("coach:correction.walkthrough.error.body")}
        />
        <AppButton
          label={t("coach:correction.picker.retryCta")}
          onClick={() => {
            load();
          }}
          testID="correction-walkthrough-retry"
        />
      </div>
    );
  } else if (state.correction.modality === "schreiben") {
    const correction = state.correction;
    body = (
      <>
        <GlobalScoreBlock
          score={correction.overallScore}
          summary={correction.summaryFr}
          scoreMax={correction.scoreMax}
          normalizedTotalPct={correction.normalizedTotalPct}
        />
        <SchreibenDiffView
          bodyDe={correction.bodyDe}
          prueferText={correction.prueferText}
          betreuerText={correction.betreuerText}
        />
        {Object.keys(correction.dimensionScores).map((key) => (
          <DimensionCard
            key={key}
            dimensionKey={key}
            score={correction.dimensionScores[key] ?? 0}
            justification=""
            onDrill={onDrill}
          />
        ))}
      </>
    );
  } else {
    // sprechen
    const fb = state.correction.feedback;
    body = (
      <>
        <GlobalScoreBlock score={fb.overall_score} summary={fb.summary.headline_fr} />
        {SPRECHEN_DIMS.map((key) => {
          const dim = fb.dimension_scores[key];
          return (
            <div key={key} className="flex flex-col gap-2">
              {/* Mutation guard (c): only render the transcript when the
                  dimension actually carries evidence spans to highlight. */}
              {dim.evidence_spans.length > 0 ? (
                <AnnotatedTranscriptView
                  transcript={fb.asr_evidence.transcript}
                  spans={dim.evidence_spans}
                  justificationDe={dim.justification_de}
                  justificationFr={dim.justification_fr}
                  testID={`correction-transcript-${key}`}
                />
              ) : null}
              <DimensionCard
                dimensionKey={key}
                score={dim.score}
                justification={dim.justification_fr}
                onDrill={onDrill}
              />
            </div>
          );
        })}
      </>
    );
  }

  return (
    <div
      className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8 lg:px-8"
      data-testid="correction-walkthrough"
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleBack}
          aria-label={t("coach:correction.walkthrough.backA11y")}
          data-testid="correction-walkthrough-back"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-bg-card transition hover:opacity-90"
        >
          <Icon name="back" size={18} label={t("coach:correction.walkthrough.backA11y")} />
        </button>
        <AppText
          as="h1"
          tone="primary"
          family="serif"
          size="h3"
          weight="bold"
          className="flex-1 text-center"
        >
          {t("coach:correction.walkthrough.title")}
        </AppText>
        <div className="h-9 w-9" aria-hidden="true" />
      </div>

      {body}
    </div>
  );
}
