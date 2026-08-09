"use client";

/**
 * `PerformanceHistoryScreen` — Performance History screen (S3 · Task
 * 3.10). Web port of
 * `deutschfit-mobile/src/features/accueil/screens/PerformanceHistoryScreen.tsx`.
 *
 * `data-testid="performance-history-screen"` sits on the screen's root
 * container — nav bar, pinned card, feed, and every empty/error state are
 * descendants of it, mirroring mobile's same-named root testID so
 * Playwright locators (Task 3.12) can scope off it.
 *
 * Layout (top → bottom): nav bar (sprite `back` button → `router.back()`
 * + centered title) → pinned diagnostic section ("TON NIVEAU" header +
 * card, or the empty-diagnostic CTA card) → feed section ("TES EXERCICES"
 * header + rows, or the calm empty card / error card) → footer spinner
 * while `loadMore()` is in flight → an `IntersectionObserver` sentinel
 * that triggers `loadMore()` when `hasMore`. The observer callback gates
 * on an `isLoadingMoreRef` (kept current via its own effect) before
 * calling `loadMore()` — `useHistory.loadMore` has no re-entrancy guard
 * of its own, so a second intersection landing while a fetch is still in
 * flight would otherwise double-fire the same cursor (duplicate rows /
 * React keys). Mirrors mobile's `handleEndReached` guard
 * (`if (!hasMore || isLoadingMore) return`).
 *
 * Deviations from mobile (S3 scope):
 *   - `FlatList` (`onEndReached` + `RefreshControl`) → plain scrollable
 *     `<div>` + `IntersectionObserver` sentinel for infinite scroll (no
 *     pull-to-refresh gesture on web; `refetch()` still runs on window
 *     `"focus"`, mirroring mobile's `useFocusEffect` #364 parity note).
 *   - Row tap-through (`handleOpenRow` → Schreiben/Sprechen feedback deep
 *     links) — **half-resolved as of S6 Task 6.9**: `kind === "schreiben"`
 *     rows (graded AND rejected) are now real `<button>`s navigating to
 *     `/{locale}/app/schreiben/feedback/<id>` (row id IS the submission
 *     id — `history.ts`). `kind === "sprechen"` rows still render
 *     `aria-disabled="true"` — no `onClick`, no navigation — until the
 *     Sprechen feedback screen lands in S7.
 *   - "Refaire" only pushes `/{locale}/app/onboarding/diagnostic?mode=retake`
 *     (the S2 deep link). Mobile threads `examLevel`/`examBoard`/
 *     `attemptId` params explicitly; the web diagnostic route
 *     (`src/app/[locale]/(learner)/app/onboarding/diagnostic/page.tsx`)
 *     already reads the exam-context store itself and self-completes the
 *     URL with `level`/`attempt` via `router.replace`, so this screen
 *     doesn't need to duplicate that read.
 *   - Mobile's `Pill` → web `Chip` (display-only, no `onClick`).
 *   - Mobile's `ErrorState` block → `EmptyState` + `AppButton` retry,
 *     matching the pattern `AccueilScreen` uses for its own error card.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useTranslation } from "react-i18next";
import clsx from "clsx";

import { Icon } from "@/learner/core/icons/Icon";
import type { IconName } from "@/learner/core/icons/iconSprite";
import { AppButton, AppText, Card, Chip, EmptyState, Skeleton } from "@/learner/ui/primitives";

import type { HistoryFeedRow } from "@/learner/core/api/history";
import { useHistory } from "../hooks/useHistory";

const DEFAULT_LOCALE = "fr";

/**
 * "14 avr. · 14:32" — short date plus 24h time so testers/QA can
 * distinguish multiple submissions made on the same day. Falls back
 * gracefully on malformed strings (the row still renders; the label is
 * just blank). Ported verbatim from the mobile screen's inline helper.
 */
function formatRowDate(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const dayMonth = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(date);
  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  return `${dayMonth} · ${time}`;
}

// Canonical-set glyph per feed kind — ported verbatim from mobile's
// `KIND_ICON` map. Keyed as a complete record over `HistoryFeedRow["kind"]`.
const KIND_ICON: Record<HistoryFeedRow["kind"], IconName> = {
  schreiben: "schreiben",
  sprechen: "sprechen",
};

function iconForKind(kind: HistoryFeedRow["kind"]): IconName {
  return KIND_ICON[kind];
}

// F-011 (#365): map the backend's canonical board token to its display
// label. Exam-board names are proper nouns with fixed casing (ÖSD,
// TestDaF, telc) — not translated, so a static map is the right home, not
// an i18n namespace. Ported verbatim from mobile's `BOARD_LABELS`.
const BOARD_LABELS: Readonly<Record<string, string>> = {
  goethe: "Goethe",
  telc: "telc",
  oesd: "ÖSD",
  testdaf: "TestDaF",
  ecl: "ECL",
};

function boardLabel(board: string): string | null {
  return BOARD_LABELS[board.trim().toLowerCase()] ?? null;
}

export function PerformanceHistoryScreen() {
  const router = useRouter();
  const locale = useLocale();
  const { t, i18n } = useTranslation(["dashboard"]);
  const dateLocale = i18n.language || locale || DEFAULT_LOCALE;

  const { pinnedDiagnostic, feed, hasMore, isLoading, isError, isLoadingMore, refetch, loadMore } =
    useHistory();

  const handleBack = useCallback((): void => {
    router.back();
  }, [router]);

  // #364 parity — mobile refetches on every focus (`useFocusEffect`) so a
  // learner returning to this screen after grading finishes sees the
  // fresh row without a manual pull-to-refresh. Web equivalent: refetch
  // on window `"focus"`.
  useEffect(() => {
    const handler = (): void => {
      void refetch();
    };
    window.addEventListener("focus", handler);
    return () => window.removeEventListener("focus", handler);
  }, [refetch]);

  const handleRetakeDiagnostic = useCallback((): void => {
    router.push(`/${locale}/app/onboarding/diagnostic?mode=retake`);
  }, [router, locale]);

  // P17 (S6 Task 6.9) — closes the loop `acknowledgeReadiness` needs: a
  // Schreiben row's id IS its submission id (`history.ts`), so the deep
  // link is a direct feedback-screen navigation. Sprechen has no feedback
  // screen yet (S7) — its rows stay `aria-disabled`, this handler is never
  // wired to them.
  const handleOpenRow = useCallback(
    (id: string): void => {
      router.push(`/${locale}/app/schreiben/feedback/${id}`);
    },
    [router, locale]
  );

  // `loadMore` has no re-entrancy guard of its own (mobile's
  // `handleEndReached` gates on `isLoadingMore` before calling — see
  // `PerformanceHistoryScreen.tsx:205-208` on mobile), so the observer
  // callback must check a ref (not the `isLoadingMore` state closed over
  // at effect-creation time) to avoid firing the same cursor twice when a
  // slow fetch is still in flight and a second intersection lands.
  const isLoadingMoreRef = useRef(isLoadingMore);
  useEffect(() => {
    isLoadingMoreRef.current = isLoadingMore;
  }, [isLoadingMore]);

  // Infinite-scroll sentinel — observed only while `hasMore`. Guarded for
  // environments without `IntersectionObserver` (unit tests never render
  // the sentinel since none of this task's fixtures set `nextCursor`).
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!hasMore) return;
    const node = sentinelRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (isLoadingMoreRef.current) return;
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMore();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  const pinnedSection = useMemo(() => {
    if (isLoading) return null;

    if (pinnedDiagnostic) {
      const levelLabel = (pinnedDiagnostic.latest.estimatedLevel || "").toUpperCase();
      const submittedLabel = formatRowDate(pinnedDiagnostic.latest.submittedAt, dateLocale);
      const subtitle = submittedLabel
        ? t("dashboard:performanceHistory.pinned.subtitle", { date: submittedLabel })
        : t("dashboard:performanceHistory.pinned.subtitleNoDate");
      return (
        <div className="flex flex-col gap-2" data-testid="performance-history-pinned-section">
          <AppText
            tone="secondary"
            size="caption"
            weight="semi"
            className="tracking-wide uppercase"
          >
            {t("dashboard:performanceHistory.pinned.header")}
          </AppText>
          <Card testID="performance-history-pinned-card" className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Chip label={levelLabel} testID="performance-history-pinned-level" />
              <AppText tone="secondary" size="small">
                {subtitle}
              </AppText>
            </div>
            {pinnedDiagnostic.deltaLabel ? (
              <AppText
                tone="primary"
                size="body"
                weight="medium"
                testID="performance-history-pinned-delta"
              >
                {pinnedDiagnostic.deltaLabel}
              </AppText>
            ) : null}
            <div className="flex justify-end">
              <AppButton
                variant="outline"
                onClick={handleRetakeDiagnostic}
                label={t("dashboard:performanceHistory.pinned.refaire")}
                testID="performance-history-pinned-retake"
              />
            </div>
          </Card>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-2" data-testid="performance-history-pinned-section">
        <AppText tone="secondary" size="caption" weight="semi" className="tracking-wide uppercase">
          {t("dashboard:performanceHistory.pinned.header")}
        </AppText>
        <Card testID="performance-history-pinned-empty" className="flex flex-col gap-2">
          <AppText tone="primary" size="body">
            {t("dashboard:performanceHistory.pinned.emptyBody")}
          </AppText>
          <div className="flex justify-start">
            <AppButton
              variant="solid"
              onClick={handleRetakeDiagnostic}
              label={t("dashboard:performanceHistory.pinned.emptyCta")}
              testID="performance-history-pinned-empty-cta"
            />
          </div>
        </Card>
      </div>
    );
  }, [pinnedDiagnostic, isLoading, dateLocale, t, handleRetakeDiagnostic]);

  const rows = feed.map((item) => {
    const dateLabel = formatRowDate(item.createdAt, dateLocale);
    const kindLabel = t(`dashboard:performanceHistory.kind.${item.kind}`);
    const isRejected = item.status === "rejected";
    const levelLabel = (item.level || "").toUpperCase();
    // P17 (S6 Task 6.9, Constraint 8) — Schreiben rows (id IS the
    // submission id) become real, keyboard-reachable buttons; Sprechen
    // rows keep the non-interactive `aria-disabled` group until S7.
    const isSchreiben = item.kind === "schreiben";
    const RowTag = isSchreiben ? "button" : "div";

    if (isRejected) {
      // F-045: backend duration gate emits two distinct codes
      // (`duration_too_short` audio-leg, `transcript_too_short` edge-fn
      // leg) that describe the same product event — both map to the
      // shared "too short" subtitle.
      const isTooShort =
        item.errorMessage === "duration_too_short" || item.errorMessage === "transcript_too_short";
      const rejectedSubtitleKey =
        item.errorMessage === "language_not_german"
          ? "dashboard:performanceHistory.rejected.subtitle.languageNotGerman"
          : isTooShort
            ? "dashboard:performanceHistory.rejected.subtitle.tooShort"
            : "dashboard:performanceHistory.rejected.subtitle.generic";
      const a11yLabel = t("dashboard:performanceHistory.rejected.openA11y", {
        kind: kindLabel,
        date: dateLabel,
      });
      return (
        <RowTag
          key={item.id}
          type={isSchreiben ? "button" : undefined}
          role={isSchreiben ? undefined : "group"}
          aria-label={a11yLabel}
          aria-disabled={isSchreiben ? undefined : "true"}
          onClick={isSchreiben ? () => handleOpenRow(item.id) : undefined}
          data-testid={`performance-history-row-${item.id}`}
          className="flex w-full flex-col gap-1 rounded-[var(--radius-lg)] bg-bg-card p-4 text-left shadow-sm opacity-80"
        >
          <div className="flex items-center gap-2">
            <Icon name={iconForKind(item.kind)} size={18} />
            <AppText tone="primary" size="body" weight="semi" className="flex-1">
              {kindLabel}
            </AppText>
            {dateLabel ? (
              <AppText tone="secondary" size="small">
                {dateLabel}
              </AppText>
            ) : null}
          </div>
          <div className="flex items-center justify-between">
            <AppText tone="secondary" size="small">
              {t(rejectedSubtitleKey)}
            </AppText>
            <Chip
              label={t("dashboard:performanceHistory.rejected.pill")}
              testID={`performance-history-row-rejected-pill-${item.id}`}
            />
          </div>
        </RowTag>
      );
    }

    const scoreLabel = t("dashboard:performanceHistory.row.scoreLabel", {
      score: item.score,
      scoreMax: item.scoreMax,
    });
    const a11yLabel = t("dashboard:performanceHistory.row.openA11y", {
      kind: kindLabel,
      date: dateLabel,
      score: item.score,
      scoreMax: item.scoreMax,
    });
    const boardName = boardLabel(item.board);

    return (
      <RowTag
        key={item.id}
        type={isSchreiben ? "button" : undefined}
        role={isSchreiben ? undefined : "group"}
        aria-label={a11yLabel}
        aria-disabled={isSchreiben ? undefined : "true"}
        onClick={isSchreiben ? () => handleOpenRow(item.id) : undefined}
        data-testid={`performance-history-row-${item.id}`}
        className="flex w-full flex-col gap-1 rounded-[var(--radius-lg)] bg-bg-card p-4 text-left shadow-sm"
      >
        <div className="flex items-center gap-2">
          <Icon name={iconForKind(item.kind)} size={18} />
          <AppText tone="primary" size="body" weight="semi" className="flex-1">
            {kindLabel}
          </AppText>
          {dateLabel ? (
            <AppText tone="secondary" size="small">
              {dateLabel}
            </AppText>
          ) : null}
        </div>
        {item.title ? (
          <AppText
            tone="primary"
            size="small"
            weight="medium"
            testID={`performance-history-row-title-${item.id}`}
          >
            {item.title}
          </AppText>
        ) : null}
        <div className="flex items-center justify-between">
          <AppText tone="secondary" size="small">
            {scoreLabel}
          </AppText>
          <div className="flex items-center gap-1">
            {boardName ? (
              <Chip label={boardName} testID={`performance-history-row-board-${item.id}`} />
            ) : null}
            {levelLabel ? (
              <Chip label={levelLabel} testID={`performance-history-row-level-${item.id}`} />
            ) : null}
          </div>
        </div>
      </RowTag>
    );
  });

  const showEmptyOrError = !isLoading && feed.length === 0;
  const showError = showEmptyOrError && isError;
  const showFeedEmpty = showEmptyOrError && !isError;

  return (
    <div
      className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8 lg:px-8"
      data-testid="performance-history-screen"
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleBack}
          aria-label={t("dashboard:performanceHistory.header.backA11y")}
          data-testid="performance-history-back-button"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-bg-card transition hover:opacity-90"
        >
          <Icon name="back" size={18} label={t("dashboard:performanceHistory.header.backA11y")} />
        </button>
        <AppText
          as="h1"
          tone="primary"
          family="serif"
          size="h3"
          weight="bold"
          className="flex-1 text-center"
        >
          {t("dashboard:performanceHistory.title")}
        </AppText>
        <div className="h-9 w-9" aria-hidden="true" />
      </div>

      {pinnedSection}

      <div className="flex flex-col gap-2">
        <AppText tone="secondary" size="caption" weight="semi" className="tracking-wide uppercase">
          {t("dashboard:performanceHistory.feed.header")}
        </AppText>

        <div className="flex flex-col gap-2">
          {rows}

          {showError ? (
            <div
              className="flex flex-col items-center gap-3"
              data-testid="performance-history-error"
            >
              <EmptyState
                title={t("dashboard:performanceHistory.error.title")}
                description={t("dashboard:performanceHistory.error.description")}
              />
              <AppButton
                label={t("dashboard:performanceHistory.error.retry")}
                onClick={() => void refetch()}
                testID="performance-history-error-retry"
              />
            </div>
          ) : null}

          {showFeedEmpty ? (
            <Card testID="performance-history-feed-empty" className="flex flex-col gap-2">
              <AppText tone="primary" size="body">
                {t("dashboard:performanceHistory.feed.emptyBody")}
              </AppText>
              <div
                className={clsx(
                  "flex items-center gap-2 self-start rounded-[var(--radius-md)] bg-bg-hero px-4 py-2 opacity-55"
                )}
              >
                <AppText tone="secondary" size="body" weight="medium">
                  {t("dashboard:performanceHistory.feed.emptyCta")}
                </AppText>
                <Chip
                  label={t("dashboard:performanceHistory.feed.emptyCtaPill")}
                  testID="performance-history-feed-empty-pill"
                />
              </div>
            </Card>
          ) : null}

          {isLoadingMore ? (
            <div
              className="flex justify-center py-4"
              data-testid="performance-history-loading-more"
            >
              <Skeleton.Block width={32} height={32} className="rounded-full" />
            </div>
          ) : null}

          {hasMore ? <div ref={sentinelRef} data-testid="history-load-more-sentinel" /> : null}
        </div>
      </div>
    </div>
  );
}
