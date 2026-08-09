"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useTranslation } from "react-i18next";
import clsx from "clsx";

import { trackEvent } from "@/learner/core/analytics/posthog";
import { AppButton, AppText, Chip, ProgressBar } from "@/learner/ui/primitives";

import {
  toResultViewModel,
  type DiagnosticResultViewModel,
  type ResultReviewRow,
  type WeaknessRow,
} from "../services/diagnosticAdapter";
import type { DiagnosticSectionKind } from "../services/getDiagnosticQuestions";
import { RESULT_CTA_CARDS, type ResultCtaCard } from "../services/resultCtaConfig";
import type { SubmitDiagnosticResult } from "../services/submitDiagnostic";
import { useDiagnosticAttemptStore } from "../state/useDiagnosticAttemptStore";

const SECTION_TOTAL: Record<DiagnosticSectionKind, number> = {
  lesen: 4,
  sprachbausteine: 6,
  wortschatz: 5,
};

const SECTION_ICON: Record<DiagnosticSectionKind, string> = {
  lesen: "📖",
  sprachbausteine: "🧱",
  wortschatz: "📚",
};

type SectionTone = "success" | "amber" | "warning";

function sectionTone(score: number, outOf: number): SectionTone {
  if (outOf <= 0) return "warning";
  const ratio = score / outOf;
  if (ratio >= 0.8) return "success";
  if (ratio >= 0.5) return "amber";
  return "warning";
}

function levelCopyKey(level: SubmitDiagnosticResult["estimatedLevel"]): string {
  // i18n key strategy: try sub-tier first (e.g. `b1.2` → `b1_2`), fall
  // back to the bare CEFR (`b1`). The locales file resolves the bare key
  // as the parent copy and the sub-tier as a refinement.
  return level.replace(".", "_");
}

function sumElapsed(): number {
  // `submitDiagnostic` echoes the timer back via `clientMeta` on the
  // request; the response itself does not carry it back. Read from the
  // store snapshot instead so the screen never has to know how the meta
  // round-trips (mobile's `sumElapsed`).
  const e = useDiagnosticAttemptStore.getState().elapsedSecPerSection;
  return (e.lesen ?? 0) + (e.sprachbausteine ?? 0) + (e.wortschatz ?? 0);
}

export interface DiagnosticResultScreenProps {
  readonly mode: "onboarding" | "retake";
}

/**
 * Onboarding Diagnostic v2 — result screen (spec 2026-05-04 §3.5). Web port
 * of `deutschfit-mobile/src/features/onboarding/screens/
 * OnboardingDiagnosticResultScreen.tsx` — same six blocks top-to-bottom:
 *
 *   1. Niveau geschätzt — big level chip + tier suffix + CEFR copy.
 *   1.b Par section     — three rows (Lesen/Sprachbausteine/Wortschatz),
 *                         green/amber/red coloring (≥80% / 50–79% / <50%).
 *   2. Où tu perds      — top-3 weakness rows from `weaknessTags`.
 *   3. Comment DeutschFit va te faire passer B2 — roadmap preview cards
 *      (all disabled in S2, "Bientôt" pill, no click handler).
 *   4. Collapsible "Revoir mes 15 réponses".
 *   5. Honest framing footer.
 *   6. Sticky `Continuer` CTA — onboarding → Motivation; retake → back().
 *
 * Reads the cached `SubmitDiagnosticResult` from
 * `useDiagnosticAttemptStore` (set by `DiagnosticScreen` after the Q15
 * submit). Never refetches on its own — a refetch would re-bill an
 * attempt server-side.
 */
export function DiagnosticResultScreen({ mode }: DiagnosticResultScreenProps) {
  const router = useRouter();
  const locale = useLocale();
  const { t } = useTranslation(["onboarding", "common"]);

  const result = useDiagnosticAttemptStore((s) => s.result);

  const viewModel = useMemo<DiagnosticResultViewModel | null>(
    () => (result ? toResultViewModel(result) : null),
    [result]
  );

  const [reviewOpen, setReviewOpen] = useState(false);

  if (!result || !viewModel) {
    // Defensive fallback: someone landed here without a submitted attempt
    // (deep-link, reload, or the store was reset). Show a minimal
    // recovery surface — this screen never decides to refetch on its
    // own; that would re-bill an attempt server-side.
    const handleClose = (): void => {
      if (mode === "retake") {
        router.back();
        return;
      }
      router.push(`/${locale}/app/onboarding`);
    };
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center"
        data-testid="onboarding-diagnostic-result-empty"
      >
        <AppText tone="warning" size="body">
          {t("onboarding:diagnosticResult.empty")}
        </AppText>
        <AppButton
          label={t("common:actions.close")}
          onClick={handleClose}
          variant="premium"
          testID="onboarding-diagnostic-result-close"
        />
      </div>
    );
  }

  const handleContinue = (): void => {
    trackEvent("onboarding_step_completed", {
      step: mode === "retake" ? "diagnostic_retake_result" : "diagnostic_result",
    });
    if (mode === "retake") {
      router.back();
      return;
    }
    router.push(`/${locale}/app/onboarding/motivation`);
  };

  const baseLevel = viewModel.estimatedLevel.replace(/\.\d+$/, "").toUpperCase();
  const cefrCopyKey = levelCopyKey(viewModel.estimatedLevel);
  const totalSeconds = sumElapsed();

  return (
    <div
      className="flex min-h-screen flex-col gap-4 px-6 pt-2 pb-6"
      data-testid="onboarding-diagnostic-result-screen"
    >
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto pb-4">
        {/* Block 1 — Niveau geschätzt */}
        <div className="flex flex-col gap-2" data-testid="diagnostic-result-block-level">
          <AppText tone="tertiary" size="caption" weight="semi" className="tracking-wide uppercase">
            {t("onboarding:diagnosticResult.levelEyebrow").toUpperCase()}
          </AppText>
          <div className="flex items-center gap-4">
            <div
              className="rounded-[var(--radius-md)] bg-bg-premium px-4 py-2"
              data-testid="diagnostic-result-level-chip"
            >
              <AppText tone="inverse" size="display" weight="semi" family="serif" surface="premium">
                {viewModel.estimatedLevel.toUpperCase()}
              </AppText>
            </div>
            <Chip
              label={t(`onboarding:diagnosticResult.tierSuffix.${viewModel.tierSuffix}`, {
                level: baseLevel,
              })}
              testID="diagnostic-result-tier-suffix"
            />
          </div>
          <AppText
            tone="primary"
            size="body"
            family="serif"
            className="mt-1"
            testID="diagnostic-result-level-copy"
          >
            {t(`onboarding:diagnosticResult.cefrCopy.${cefrCopyKey}`, {
              defaultValue: t("onboarding:diagnosticResult.cefrCopy.fallback"),
            })}
          </AppText>
        </div>

        <Divider />

        {/* Block 1.b — Par section */}
        <div className="flex flex-col gap-2" data-testid="diagnostic-result-block-sections">
          <AppText tone="tertiary" size="caption" weight="semi" className="tracking-wide uppercase">
            {t("onboarding:diagnosticResult.bySection").toUpperCase()}
          </AppText>
          <div className="flex flex-col gap-3">
            <SectionRow
              kind="lesen"
              score={result.scorePerSection.lesen}
              label={t("onboarding:diagnostic.section.lesen")}
            />
            <SectionRow
              kind="sprachbausteine"
              score={result.scorePerSection.sprachbausteine}
              label={t("onboarding:diagnostic.section.sprachbausteine")}
            />
            <SectionRow
              kind="wortschatz"
              score={result.scorePerSection.wortschatz}
              label={t("onboarding:diagnostic.section.wortschatz")}
            />
          </div>
          <AppText
            tone="tertiary"
            size="small"
            numeric
            align="right"
            className="mt-2"
            testID="diagnostic-result-total"
          >
            {t("onboarding:diagnosticResult.total", {
              score: viewModel.totalScore,
              outOf: viewModel.totalOutOf,
              clock: t("onboarding:diagnosticResult.clock", {
                minutes: Math.floor(totalSeconds / 60),
                seconds: totalSeconds % 60,
              }),
            })}
          </AppText>
        </div>

        <Divider />

        {/* Block 2 — Où tu perds des points */}
        {viewModel.weaknesses.length > 0 ? (
          <>
            <div className="flex flex-col gap-2" data-testid="diagnostic-result-block-weaknesses">
              <AppText
                tone="tertiary"
                size="caption"
                weight="semi"
                className="tracking-wide uppercase"
              >
                {t("onboarding:diagnosticResult.weaknesses").toUpperCase()}
              </AppText>
              <div className="flex flex-col gap-3">
                {viewModel.weaknesses.map((row) => (
                  <WeaknessRowView key={row.tag} row={row} t={t} />
                ))}
              </div>
            </div>
            <Divider />
          </>
        ) : null}

        {/* Block 3 — CTA cards */}
        <div className="flex flex-col gap-2" data-testid="diagnostic-result-block-cta">
          <AppText tone="tertiary" size="caption" weight="semi" className="tracking-wide uppercase">
            {t("onboarding:diagnosticResult.howWeWillHelp").toUpperCase()}
          </AppText>
          <div className="flex flex-col gap-3">
            {RESULT_CTA_CARDS.map((card) => (
              <CtaCardView key={card.id} card={card} t={t} />
            ))}
          </div>
        </div>

        <Divider />

        {/* Collapsible review */}
        <div className="flex flex-col gap-2" data-testid="diagnostic-result-block-review">
          <button
            type="button"
            aria-expanded={reviewOpen}
            aria-label={t("onboarding:diagnosticResult.review.toggle")}
            onClick={() => setReviewOpen((v) => !v)}
            className="self-start py-2 text-left"
            data-testid="diagnostic-result-review-toggle"
          >
            <AppText tone="primary" size="body" weight="semi">
              {reviewOpen ? "▾" : "▸"} {t("onboarding:diagnosticResult.review.toggle")}
            </AppText>
          </button>
          {reviewOpen ? (
            <div className="flex flex-col gap-3" data-testid="diagnostic-result-review-list">
              {viewModel.review.map((row) => (
                <ReviewRowView key={row.questionId} row={row} t={t} />
              ))}
            </div>
          ) : null}
        </div>

        <Divider />

        {/* Footer */}
        <AppText
          tone="tertiary"
          size="small"
          className="mt-2 italic"
          testID="diagnostic-result-footer"
        >
          {t("onboarding:diagnosticResult.footer")}
        </AppText>
      </div>

      <AppButton
        label={t("onboarding:continue")}
        onClick={handleContinue}
        variant="premium"
        testID="diagnostic-result-continue"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-views
// ---------------------------------------------------------------------------

function Divider() {
  return <div className="h-px w-full bg-line-soft" aria-hidden="true" />;
}

function SectionRow({
  kind,
  score,
  label,
}: {
  readonly kind: DiagnosticSectionKind;
  readonly score: number;
  readonly label: string;
}) {
  const outOf = SECTION_TOTAL[kind];
  const tone = sectionTone(score, outOf);
  const barTone = tone === "success" ? "success" : tone === "amber" ? "gold" : "cta";
  const value = outOf > 0 ? score / outOf : 0;
  return (
    <div className="flex items-center gap-4" data-testid={`diagnostic-result-section-${kind}`}>
      <AppText tone="primary" size="body" className="w-7 text-center" aria-hidden="true">
        {SECTION_ICON[kind]}
      </AppText>
      <div className="flex flex-1 flex-col gap-1">
        <AppText tone="primary" size="body" weight="medium">
          {label}
        </AppText>
        <ProgressBar
          value={value}
          tone={barTone}
          aria-label={`${label}: ${score}/${outOf}`}
          testID={`diagnostic-result-section-${kind}-bar`}
        />
      </div>
      <AppText
        tone={tone === "warning" ? "warning" : "primary"}
        size="body"
        weight="semi"
        numeric
        className="min-w-14 text-right"
        testID={`diagnostic-result-section-${kind}-score`}
      >
        {score} / {outOf}
      </AppText>
    </div>
  );
}

function WeaknessRowView({
  row,
  t,
}: {
  readonly row: WeaknessRow;
  readonly t: ReturnType<typeof useTranslation>["t"];
}) {
  const sectionLabel =
    row.section !== null ? t(`onboarding:diagnostic.section.${row.section}`) : "";
  const tagLabel = t(`onboarding:diagnosticResult.tagLabel.${row.tag}`, {
    defaultValue: row.tag,
  });
  return (
    <div className="flex items-start gap-3" data-testid={`diagnostic-result-weakness-${row.tag}`}>
      <AppText tone="warning" size="body" className="w-6 text-center" aria-hidden="true">
        {"⚠"}
      </AppText>
      <div className="flex flex-1 flex-col gap-1">
        <AppText tone="primary" size="body" weight="semi">
          {tagLabel}
        </AppText>
        <AppText tone="tertiary" size="small" numeric>
          {sectionLabel}
          {sectionLabel ? " · " : ""}
          {t("onboarding:diagnosticResult.weaknessCount", {
            count: row.errorCount,
            outOf: row.outOf,
          })}
        </AppText>
      </div>
    </div>
  );
}

function CtaCardView({
  card,
  t,
}: {
  readonly card: ResultCtaCard;
  readonly t: ReturnType<typeof useTranslation>["t"];
}) {
  const disabled = card.disabled;
  return (
    <div
      role="group"
      aria-disabled={disabled ? "true" : "false"}
      className={clsx(
        "flex items-center gap-4 rounded-[var(--radius-md)] border border-line-soft bg-bg-card p-4",
        disabled ? "opacity-55" : null
      )}
      data-testid={`diagnostic-result-cta-${card.id}`}
    >
      <AppText tone="primary" size="h3" className="w-8 text-center" aria-hidden="true">
        {card.icon}
      </AppText>
      <div className="flex flex-1 flex-col gap-1">
        <AppText tone="primary" size="body" weight="semi">
          {t(card.titleKey)}
        </AppText>
        <AppText tone="tertiary" size="small">
          {t(card.subtitleKey)}
        </AppText>
      </div>
      {disabled ? (
        <Chip
          label={t("onboarding:diagnosticResult.cta.soon")}
          testID={`diagnostic-result-cta-${card.id}-soon`}
        />
      ) : (
        <AppText tone="cta" size="h3" aria-hidden="true">
          {"→"}
        </AppText>
      )}
    </div>
  );
}

function ReviewRowView({
  row,
  t,
}: {
  readonly row: ResultReviewRow;
  readonly t: ReturnType<typeof useTranslation>["t"];
}) {
  const mark = row.wasCorrect ? "✓" : "✗";
  return (
    <div
      className="flex flex-col gap-1 rounded-[var(--radius-sm)] border border-line-soft p-3"
      data-testid={`diagnostic-result-review-${row.questionId}`}
    >
      <div className="flex items-center gap-2">
        <AppText
          tone={row.wasCorrect ? "success" : "warning"}
          size="body"
          weight="semi"
          className="w-5 text-center"
          aria-hidden="true"
        >
          {mark}
        </AppText>
        <AppText tone="tertiary" size="small" numeric>
          {t("onboarding:diagnosticResult.review.questionLabel", { index: row.globalIndex })}
        </AppText>
      </div>
      <AppText tone="secondary" size="small">
        {t("onboarding:diagnosticResult.review.yourAnswer", {
          option: row.selectedOption ?? t("onboarding:diagnosticResult.review.noAnswer"),
        })}
      </AppText>
      {!row.wasCorrect ? (
        <>
          <AppText tone="primary" size="small" weight="medium">
            {t("onboarding:diagnosticResult.review.correctAnswer", { option: row.correctOption })}
          </AppText>
          {row.explanationDe ? (
            <AppText tone="secondary" size="small">
              {row.explanationDe}
            </AppText>
          ) : null}
          {row.explanationEn ? (
            <AppText tone="tertiary" size="small">
              {row.explanationEn}
            </AppText>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
