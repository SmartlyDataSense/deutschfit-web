"use client";

/**
 * `CorrectionPickerScreen` — paginated list of the learner's graded
 * Schreiben + Sprechen submissions, newest first (S9 · Task 9.9). Web
 * port of
 * `deutschfit-mobile/src/features/coach/correction/screens/CorrectionPickerScreen.tsx`.
 * Read-only: clicking a row opens the walkthrough. Backed by
 * `history-get` via `@/learner/core/api/history`.
 *
 * The coach hub's "correction" tile already links to `${base}/coach/correction`
 * (`hubTiles.ts`, Task 9.3) — this screen is what that route renders.
 *
 * Web delta from mobile: mobile's `FlatList` end-reached pagination is an
 * explicit "Voir plus" footer button here rather than an
 * `IntersectionObserver` sentinel like `PerformanceHistoryScreen` uses —
 * this is the brief's deliberate choice (task-9.9-brief.md Step 3: "no
 * IntersectionObserver — mobile uses an explicit footer button here,
 * unlike the history screen"), not an oversight.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useTranslation } from "react-i18next";

import { Icon, type IconName } from "@/learner/core/icons";
import { fetchHistory, type HistoryFeedRow } from "@/learner/core/api/history";
import { AppButton, AppText, EmptyState, Skeleton } from "@/learner/ui/primitives";

type Status = "loading" | "ready" | "error";

const KIND_ICON: Record<HistoryFeedRow["kind"], IconName> = {
  schreiben: "schreiben",
  sprechen: "sprechen",
};

/**
 * Row date format is locked to `fr-FR` regardless of the app locale
 * (verbatim port of mobile's `new Date(...).toLocaleDateString("fr-FR", ...)`
 * — task-9.9-brief.md Step 1 specifies this exact call, unlike
 * `PerformanceHistoryScreen`'s locale-aware `formatRowDate`).
 */
function formatRowDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

export function CorrectionPickerScreen() {
  const router = useRouter();
  const locale = useLocale();
  const base = `/${locale}/app`;
  const { t } = useTranslation(["coach"]);

  const [status, setStatus] = useState<Status>("loading");
  const [rows, setRows] = useState<readonly HistoryFeedRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // `isCancelled` defaults to "never cancelled" so `handleRetry` and
  // `handleLoadMore` (plain click handlers, not effects) can call `load`
  // unguarded — see the file-header note on why only the mount effect
  // below supplies a real predicate.
  const load = useCallback(
    async (nextCursor: string | null, isCancelled: () => boolean = () => false): Promise<void> => {
      try {
        const payload = await fetchHistory(nextCursor != null ? { cursor: nextCursor } : {});
        if (isCancelled()) return;
        // Mutation guard (a): this filter is load-bearing — rejected
        // submissions have no correction to walk through.
        const graded = payload.feed.filter((r) => r.status !== "rejected");
        setRows((prev) => (nextCursor != null ? [...prev, ...graded] : [...graded]));
        setCursor(payload.nextCursor);
        setStatus("ready");
      } catch {
        if (!isCancelled()) setStatus("error");
      } finally {
        if (!isCancelled()) setLoadingMore(false);
      }
    },
    []
  );

  // Constraint 12: `cancelled` is declared INSIDE the effect setup body —
  // a StrictMode double-invoke re-runs this closure fresh each time, so
  // there is no shared ref to go stale between setup -> cleanup -> setup.
  // Without this guard, the dev-only double-invoke fires two concurrent
  // `fetchHistory({})` calls that race to call `setRows`/`setCursor`/
  // `setStatus`; if a submission is graded/rejected between the two
  // responses, the later-arriving one can silently clobber fresher state.
  useEffect(() => {
    let cancelled = false;
    void load(null, () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [load]);

  // No `cancelled` guard here — deliberate, not an oversight. Click
  // handlers are never re-invoked by StrictMode (only effects double-fire
  // in dev), and `TopicPickerScreen.tsx`'s `refetch` (the retry-button
  // analogue in this codebase's own established pattern) is equally
  // unguarded — only its mount effect carries the flag. Re-entrancy is
  // already structurally impossible: setting `status` to "loading"
  // immediately swaps the error view (and its retry button) for the
  // loading skeleton, so there is no button left to double-click while a
  // retry is in flight.
  const handleRetry = useCallback(() => {
    setStatus("loading");
    void load(null);
  }, [load]);

  // Same reasoning as `handleRetry`: re-entrancy is already prevented by
  // the `loadingMore` state gate below (checked-and-set synchronously,
  // before the async call) plus `AppButton`'s `loading` prop, which
  // disables the trigger for the duration of the request.
  const handleLoadMore = useCallback(() => {
    if (cursor == null || loadingMore) return;
    setLoadingMore(true);
    void load(cursor);
  }, [cursor, loadingMore, load]);

  const openRow = useCallback(
    (row: HistoryFeedRow) => {
      router.push(`${base}/coach/correction/${row.kind}/${row.id}`);
    },
    [router, base]
  );

  return (
    <div
      className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8 lg:px-8"
      data-testid="correction-picker"
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label={t("coach:correction.picker.backA11y")}
          data-testid="correction-picker-back"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-bg-card transition hover:opacity-90"
        >
          <Icon name="back" size={18} label={t("coach:correction.picker.backA11y")} />
        </button>
        <AppText
          as="h1"
          tone="primary"
          family="serif"
          size="h3"
          weight="bold"
          className="flex-1 text-center"
        >
          {t("coach:correction.picker.title")}
        </AppText>
        <div className="h-9 w-9" aria-hidden="true" />
      </div>

      <AppText tone="secondary" size="body">
        {t("coach:correction.picker.subtitle")}
      </AppText>

      {status === "loading" ? (
        <div className="flex flex-col gap-2" data-testid="correction-picker-loading">
          <Skeleton.Card />
          <Skeleton.Card />
          <Skeleton.Card />
        </div>
      ) : status === "error" ? (
        <div className="flex flex-col items-center gap-3" data-testid="correction-picker-error">
          <EmptyState
            title={t("coach:correction.picker.error.title")}
            description={t("coach:correction.picker.error.body")}
          />
          <AppButton
            label={t("coach:correction.picker.retryCta")}
            onClick={handleRetry}
            testID="correction-picker-retry"
          />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          testID="correction-picker-empty"
          title={t("coach:correction.picker.empty.title")}
          description={t("coach:correction.picker.empty.body")}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((row) => {
            const displayDate = formatRowDate(row.createdAt);
            return (
              <button
                key={row.id}
                type="button"
                data-testid={`correction-row-${row.id}`}
                aria-label={t("coach:correction.picker.rowA11y", { date: displayDate })}
                onClick={() => openRow(row)}
                className="flex items-center gap-3 rounded-[var(--radius-md)] border border-line-soft bg-bg-card px-4 py-3 text-left transition hover:bg-bg-subtle"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-coach-subtle text-coach">
                  <Icon name={KIND_ICON[row.kind]} size={20} />
                </div>
                <div className="flex flex-1 flex-col gap-1">
                  {row.title != null ? (
                    <AppText tone="primary" size="small" weight="semi" className="truncate">
                      {row.title}
                    </AppText>
                  ) : null}
                  <AppText tone="secondary" size="caption">
                    {row.level}
                    {" · "}
                    {displayDate}
                  </AppText>
                </div>
                <AppText tone="tertiary" size="caption">
                  {row.score}
                  {"/"}
                  {row.scoreMax}
                </AppText>
                <Icon name="chevron" size={16} />
              </button>
            );
          })}

          {cursor != null ? (
            <AppButton
              variant="outline"
              label={t("coach:correction.picker.loadMoreCta")}
              onClick={handleLoadMore}
              loading={loadingMore}
              testID="correction-load-more"
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
