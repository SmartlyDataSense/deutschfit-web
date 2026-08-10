"use client";

/**
 * `SimulationResultsScreen` — full-mock-exam results (S8 · Task 8.8).
 * Web port of `deutschfit-mobile/src/features/exam/screens/
 * SimulationResultsScreen.tsx` (440L) + `useSimulationResults.ts`'s
 * `SKILL_META`/tone/state rules — testIDs, layout order, and the
 * mobile-verbatim hardcoded French strings are the spec (P8/P9/P14/P15
 * deltas pinned in the task-8.8 brief).
 *
 * Data source: `useSimulationRun` (S8 · Task 8.2/8.7) — NOT navigation
 * params like mobile. `result === null` (hard refresh / direct deep-link
 * onto this route) bounces to `/{locale}/app/examen/simulation`, which
 * re-resolves pending-or-home (P10) — same empty-store-redirect idiom as
 * `LesenResultsScreen`/`HoerenResultsScreen`.
 *
 * `buildSimulationResultsViewModel` is the single derivation step (pure,
 * exported for direct unit testing) over the shipped shapes ONLY —
 * `CompetenceSkills`/`CompetenceBar` from `normaliseReport`, `SkillScore`
 * from `@/learner/core/exam/skillScores`. It NEVER invents a number:
 *
 *   - `percent` (P9) is the mean of the *scored* Lesen/Hören
 *     `CompetenceBar.score` (already the 0–100 `scaled_score` for a
 *     scored module, per `normaliseModule`, `mockExam.ts:793–810`) — 0
 *     scored modules → percent 0. Schreiben/Sprechen never feed the
 *     donut in v1.0 scope (no simulation leg for either yet).
 *   - `counts`/`skippedFraction` (the amber "could-have-got" arc) are
 *     derived ONLY from the run store's real per-leg `ModuleOutcome`
 *     counts (`recordOutcome`, Task 8.5) — when either leg's outcome is
 *     absent (a never-advanced leg, 8.5 carry-forward), `counts` is
 *     `null`, the amber arc is 0, and the "N bonnes"/"Résultat · N sur M
 *     items" lines don't render at all. There is no synthesized
 *     fallback.
 *   - Each competence row resolves straight off `run.result.skills`
 *     (`toSkillScores(normaliseReport(report))`, written verbatim by the
 *     orchestrator's finalize step). A `null` score (missing/deferred/
 *     pending-unscored) is never coerced into a fake "0/0" — it renders
 *     through `CompetenceBarRow`'s nullable-score em-dash branch (Task
 *     8.8 Cycle A). Mobile's deterministic-spread placeholder for the 3
 *     non-active skills (`useSimulationResults.ts:114–158` — a helper
 *     function plus an offset-table constant, named for what they do) is
 *     explicitly NOT ported — P8 anti-requirement, zero invented numbers
 *     anywhere on this screen.
 *
 * Web deltas from mobile (P14):
 *   - `examLabel` is `formatExamTrackLabel(board, level)` from the
 *     exam-context store (mobile's caller threads a session title
 *     through navigation params; web has no such intermediate screen
 *     state to carry one).
 *   - The "Voir les corrections" review CTA is dropped — no `LesenReview`
 *     surface exists on web. Only the ghost "Retour à l'examen" button
 *     renders in the footer (a real hierarchy delta from mobile's
 *     solid-primary + ghost-secondary pair, noted here rather than
 *     silently matched).
 *   - The verdict card reuses `BetreuerCard`'s visual language (rounded
 *     card, `border-line-soft`/`bg-bg-card`, serif heading + secondary
 *     body — see `ModuleResultLayout.tsx`'s import of `BetreuerCard`) but
 *     NOT the component itself: `BetreuerCard`'s heading is the fixed
 *     `common:coach.title` string, while this card's heading is the
 *     dynamic `verdict.title` (`buildVerdict`'s band copy) — inlined
 *     markup with the same classes rather than forcing an incompatible
 *     prop onto a shared component.
 *
 * Threshold boundary note: the task brief's fixture pins Hören's scaled
 * score at exactly 60 against an `effectiveMax` of 100 — fraction 0.6,
 * landing exactly on the tone/state boundary. Mobile's own
 * `toneForSkill`/`stateForSkill` (`SimulationResultsScreen.tsx:334–349`)
 * evaluate `fraction >= 0.6` FIRST (teal, no chip) before the `< 0.5`/
 * `< 0.6` state checks, so 0.6 exactly resolves to teal + no chip, not
 * amber "aTravailler" — this is the mobile-verbatim, code-accurate
 * reading (the task brief's own inline derivations block states the same
 * `>= 0.6 → teal` rule), and is what this port implements.
 */
import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useTranslation } from "react-i18next";

import { AppButton, AppText, Donut } from "@/learner/ui/primitives";
import {
  CompetenceBarRow,
  type CompetenceBarState,
  type CompetenceBarTone,
} from "@/learner/ui/blocks/CompetenceBarRow";

import { normaliseReport, type CompetenceBar } from "@/learner/core/api/examApi";
import { useExamContextStore } from "@/learner/core/exam/examContext";
import { formatExamTrackLabel } from "@/learner/core/exam/examTypes";
import {
  useSimulationRun,
  type ModuleOutcome,
  type SimulationRunResult,
} from "@/learner/core/exam/simulationRunStore";
import type { SkillModuleKey, SkillScore } from "@/learner/core/exam/skillScores";
import { buildVerdict, type VerdictCopy } from "../verdict";

// ---------------------------------------------------------------------------
// View-model (pure — exported for unit tests).
// ---------------------------------------------------------------------------

export interface SimulationResultsRow {
  readonly key: SkillModuleKey;
  readonly label: string;
  readonly italicSubtitle: string;
  readonly score: number | null;
  readonly max: number | null;
  readonly tone: CompetenceBarTone;
  readonly state: CompetenceBarState | undefined;
}

export interface SimulationResultsCounts {
  readonly correct: number;
  readonly total: number;
  readonly unanswered: number;
}

export interface SimulationResultsViewModel {
  readonly percent: number;
  readonly skippedFraction: number;
  readonly counts: SimulationResultsCounts | null;
  readonly verdict: VerdictCopy;
  readonly rows: readonly SimulationResultsRow[];
}

/** Subset of `useSimulationRun`'s state this view-model actually reads. */
export interface SimulationResultsRunInput {
  readonly result: SimulationRunResult;
  readonly outcomes: {
    readonly lesen?: ModuleOutcome;
    readonly hoeren?: ModuleOutcome;
  };
}

const SKILL_META: Record<SkillModuleKey, { readonly label: string; readonly italic: string }> = {
  lesen: { label: "Lesen", italic: "Compréhension écrite" },
  hoeren: { label: "Hören", italic: "Compréhension orale" },
  schreiben: { label: "Schreiben", italic: "Production écrite" },
  sprechen: { label: "Sprechen", italic: "Production orale" },
};

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Resolves one `CompetenceBarRow` presentation from a `SkillScore` (B3):
 *   - `score === null` (missing/deferred/pending-unscored) → the em-dash
 *     row: `{score: null, max: null, tone: "amber", state: "priorite"}`.
 *     This subsumes mobile's separate `max === 0` branch — web's
 *     `SkillScore` never carries a 0 max, only `null`.
 *   - `score !== null` → `effectiveMax = s.max ?? 100` (backend writes no
 *     `max_score` for scored Lesen/Hören; `scaled_score` is already a
 *     0–100 scale, so 100 IS the scale here, not an invented grade) →
 *     fraction → mobile's tone/state thresholds ON THE FRACTION.
 *
 * Mobile's `skill.isActive` short-circuit (`SimulationResultsScreen.tsx:338`)
 * is deliberately DROPPED: web's `SkillScore` has no `isActive` field, and
 * no row is "the active module" on a finalized 4-module report — every row
 * here is either server-scored or honestly unscored.
 */
function resolveRow(s: SkillScore): SimulationResultsRow {
  const meta = SKILL_META[s.key];
  if (s.score === null) {
    return {
      key: s.key,
      label: meta.label,
      italicSubtitle: meta.italic,
      score: null,
      max: null,
      tone: "amber",
      state: "priorite",
    };
  }
  const effectiveMax = s.max ?? 100;
  const fraction = clamp01(effectiveMax > 0 ? s.score / effectiveMax : 0);
  let tone: CompetenceBarTone;
  let state: CompetenceBarState | undefined;
  if (fraction >= 0.6) {
    tone = "teal";
    state = undefined;
  } else if (fraction < 0.5) {
    tone = "amber";
    state = "priorite";
  } else {
    tone = "amber";
    state = "aTravailler";
  }
  return {
    key: s.key,
    label: meta.label,
    italicSubtitle: meta.italic,
    score: s.score,
    max: effectiveMax,
    tone,
    state,
  };
}

export function buildSimulationResultsViewModel(
  run: SimulationResultsRunInput
): SimulationResultsViewModel {
  const bars = normaliseReport(run.result.report);
  const scored = ([bars.lesen, bars.hoeren] as readonly CompetenceBar[]).filter(
    (b): b is CompetenceBar & { score: number } => b.status === "scored" && b.score !== null
  );
  const percent = scored.length ? Math.round(mean(scored.map((b) => b.score))) : 0;

  const { lesen, hoeren } = run.outcomes;
  const counts: SimulationResultsCounts | null =
    lesen && hoeren
      ? {
          correct: lesen.raw + hoeren.raw,
          total: lesen.total + hoeren.total,
          unanswered: lesen.unanswered + hoeren.unanswered,
        }
      : null;

  const skippedFraction = counts
    ? Math.min(counts.total > 0 ? counts.unanswered / counts.total : 0, 1 - percent / 100)
    : 0;

  const verdict = buildVerdict(percent / 100);
  const rows = run.result.skills.map(resolveRow);

  return { percent, skippedFraction, counts, verdict, rows };
}

// ---------------------------------------------------------------------------
// Screen.
// ---------------------------------------------------------------------------

export function SimulationResultsScreen() {
  const router = useRouter();
  const locale = useLocale();
  const { t } = useTranslation(["common"]);

  const result = useSimulationRun((s) => s.result);
  const outcomes = useSimulationRun((s) => s.outcomes);
  const durationMinutesTotal = useSimulationRun((s) => s.durationMinutesTotal);
  const mockAttemptId = useSimulationRun((s) => s.mockAttemptId);
  const clear = useSimulationRun((s) => s.clear);

  const board = useExamContextStore((s) => s.board);
  const level = useExamContextStore((s) => s.level);

  // One-shot leaving-ref (same idiom as the orchestrator's `bootedRef`/
  // `isMountedRef`): `handleBack` sets this synchronously BEFORE `clear()`
  // so the empty-store redirect effect below — which would otherwise fire
  // on the very next render once `clear()` nulls `result` — knows this
  // unmount is an intentional back-navigation, not a hard-refresh/deep-link
  // empty state, and skips its own competing `router.replace`. Without this
  // guard the effect's `/examen/simulation` replace supersedes the back
  // CTA's `/examen` replace, bouncing the user through the orchestrator on
  // every completed simulation (final-review I-1).
  const leavingRef = useRef(false);

  useEffect(() => {
    if (!result && !leavingRef.current) {
      router.replace(`/${locale}/app/examen/simulation`);
    }
  }, [result, locale, router]);

  const handleBack = useCallback(() => {
    leavingRef.current = true;
    clear();
    router.replace(`/${locale}/app/examen`);
  }, [clear, locale, router]);

  if (!result) {
    return null;
  }

  const examLabel = formatExamTrackLabel(board, level);
  const { percent, skippedFraction, counts, verdict, rows } = buildSimulationResultsViewModel({
    result,
    outcomes,
  });
  const correctArcPct = Math.round((percent / 100) * 100);
  const skippedArcPct = Math.round(skippedFraction * 100);

  return (
    <div
      className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 lg:px-8"
      data-testid="simulation-results-scroll"
    >
      {/* 1 — Header */}
      <div className="flex flex-col gap-1">
        <AppText size="caption" tone="secondary" className="tracking-wide uppercase">
          Résultats de la simulation
        </AppText>
        <AppText size="h2" weight="bold" family="serif">
          {examLabel}
        </AppText>
        <div className="mt-1 flex gap-2">
          <div
            data-testid="simulation-level-badge"
            className="rounded-[var(--radius-full)] border border-line-soft bg-bg-card px-3 py-1"
          >
            <AppText size="caption" weight="semi">
              {examLabel}
            </AppText>
          </div>
          {durationMinutesTotal > 0 ? (
            <div
              data-testid="simulation-duration-badge"
              className="rounded-[var(--radius-full)] border border-line-soft bg-bg-card px-3 py-1"
            >
              <AppText size="caption" weight="semi">
                {`${durationMinutesTotal} min`}
              </AppText>
            </div>
          ) : null}
        </div>
      </div>

      {/* 2 — 2-arc donut */}
      <div className="flex flex-col items-center gap-2">
        <Donut
          size={188}
          stroke={18}
          segments={[
            { value: percent / 100, tone: "teal" },
            { value: skippedFraction, tone: "amber" },
          ]}
          className="mt-2"
          testID="simulation-donut"
        >
          <AppText size="h1" family="serif" weight="bold" numeric>
            {`${percent}%`}
          </AppText>
          {counts ? (
            <AppText size="caption" tone="secondary">
              {`${counts.correct}/${counts.total} bonnes`}
            </AppText>
          ) : null}
        </Donut>
        {/* Hidden accessibility proxies (mobile parity) — screen readers
         * (and tests) distinguish the teal "acquis" arc from the amber
         * "à consolider" arc; the visible ring is drawn by `Donut` above. */}
        <div
          role="progressbar"
          aria-label={`Acquis: ${correctArcPct} pourcent`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          data-testid="simulation-donut-arc-correct"
          className="sr-only"
        />
        <div
          role="progressbar"
          aria-label={`À consolider: ${skippedArcPct} pourcent`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={skippedArcPct}
          data-testid="simulation-donut-arc-skipped"
          className="sr-only"
        />
        <div className="mt-1 flex gap-4">
          <div className="flex items-center gap-2" data-testid="simulation-legend-correct">
            <span className="h-3 w-3 rounded-[var(--radius-full)] bg-coach" />
            <AppText size="caption" tone="secondary">
              Acquis
            </AppText>
          </div>
          <div className="flex items-center gap-2" data-testid="simulation-legend-skipped">
            <span className="h-3 w-3 rounded-[var(--radius-full)] bg-accent-gold" />
            <AppText size="caption" tone="secondary">
              À consolider
            </AppText>
          </div>
        </div>
      </div>

      {/* 3 — Competence rows */}
      <div className="flex flex-col gap-1">
        <AppText
          size="caption"
          weight="semi"
          tone="secondary"
          testID="simulation-competences-label"
          className="tracking-wide uppercase"
        >
          {t("common:moduleResult.competencesTitle")}
        </AppText>
        {counts ? (
          <AppText size="caption" tone="tertiary">
            {`Résultat · ${counts.correct} sur ${counts.total} items`}
          </AppText>
        ) : null}
        <div className="mt-2 flex flex-col gap-4">
          {rows.map((row) => (
            <CompetenceBarRow
              key={row.key}
              label={row.label}
              italicSubtitle={row.italicSubtitle}
              score={row.score}
              max={row.max}
              tone={row.tone}
              state={row.state}
              testID={`competence-row-${row.key}`}
            />
          ))}
        </div>
      </div>

      {/* 4 — Verdict (Betreuer-toned card; see doc comment for why this
       * doesn't reuse `BetreuerCard` directly — dynamic title vs. its
       * fixed heading). */}
      <div className="flex flex-col gap-1">
        <AppText
          size="caption"
          weight="semi"
          tone="secondary"
          testID="simulation-verdict-label"
          className="tracking-wide uppercase"
        >
          {t("common:moduleResult.verdictTitle")}
        </AppText>
        <div
          data-testid="simulation-verdict"
          className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-line-soft bg-bg-card p-4"
        >
          <AppText family="serif" size="body" weight="semi">
            {verdict.title}
          </AppText>
          <AppText tone="secondary" size="body" className="leading-6">
            {verdict.body}
          </AppText>
        </div>
      </div>

      {/* 5 — Meta line */}
      <AppText tone="tertiary" size="caption" numeric>
        {`Soumission · ${mockAttemptId ?? ""}`}
      </AppText>

      {/* 6 — Footer. Web delta (P14): no "Voir les corrections" CTA — no
       * LesenReview surface on web; only the ghost back button renders. */}
      <AppButton
        label="Retour à l'examen"
        onClick={handleBack}
        variant="ghost"
        testID="simulation-back-cta"
      />
    </div>
  );
}
