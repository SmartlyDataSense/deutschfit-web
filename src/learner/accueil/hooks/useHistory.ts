/**
 * `useHistory` — loads the cursor-paginated `history-get` payload that
 * backs the Performance History screen.
 *
 * Ports `deutschfit-mobile/src/features/accueil/hooks/useHistory.ts`
 * verbatim (S3 · Task 3.6) — zero RN imports, only the client import path
 * changes (`@core/api/history` → `@/learner/core/api/history`).
 *
 * Mirrors the `useState` / `useEffect` idiom of `useAccueilHome` rather
 * than introducing TanStack Query. The hook owns:
 *
 *   - `pinnedDiagnostic` — top-card payload (latest + delta string).
 *   - `feed`             — accumulated rows across all pages fetched so
 *                          far. The first page replaces; subsequent
 *                          `loadMore()` calls append.
 *   - `hasMore`          — server `nextCursor` is non-null.
 *   - `isLoading`        — initial fetch only; later refetches flip
 *                          `isRefetching` instead so the screen stays
 *                          stable.
 *   - `isLoadingMore`    — `loadMore()` is in flight; powers the footer
 *                          spinner.
 *   - `isError`          — most recent fetch failed *and* we have no
 *                          previous payload (cache-keep rule).
 *   - `refetch`          — pull-to-refresh handle. Resets the cursor
 *                          and replaces `feed` with the first page.
 *   - `loadMore`         — appends the next page, no-op when
 *                          `hasMore === false` or already in flight.
 *
 * Cancellation: each in-flight fetch owns a `cancelled` flag scoped to
 * the effect / callback closure (same pattern as `useAccueilHome`).
 *
 * Auth: requests go through `invokeFn` inside `fetchHistory`, which
 * threads the caller's JWT automatically.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import {
  fetchHistory,
  type FetchHistoryArgs,
  type HistoryFeedRow,
  type HistoryPayload,
  type HistoryPinnedDiagnostic,
} from "@/learner/core/api/history";

const PAGE_LIMIT = 20;

export interface UseHistoryResult {
  readonly pinnedDiagnostic: HistoryPinnedDiagnostic | null;
  readonly feed: readonly HistoryFeedRow[];
  readonly hasMore: boolean;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly isRefetching: boolean;
  readonly isLoadingMore: boolean;
  readonly refetch: () => Promise<void>;
  readonly loadMore: () => Promise<void>;
}

export interface UseHistoryArgs {
  readonly enabled?: boolean;
  readonly deps?: {
    readonly fetchHistory?: (args: FetchHistoryArgs) => Promise<HistoryPayload>;
  };
}

export function useHistory(args: UseHistoryArgs = {}): UseHistoryResult {
  const enabled = args.enabled ?? true;
  const fetcher = args.deps?.fetchHistory ?? fetchHistory;

  const [pinnedDiagnostic, setPinnedDiagnostic] = useState<HistoryPinnedDiagnostic | null>(null);
  const [feed, setFeed] = useState<readonly HistoryFeedRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(enabled);
  const [isError, setIsError] = useState<boolean>(false);
  const [isRefetching, setIsRefetching] = useState<boolean>(false);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);

  // Track whether we have any previous successful payload so a fresh
  // failure on refetch / loadMore stays silent and keeps the existing
  // rows on screen.
  const hasDataRef = useRef<boolean>(false);
  // Latest cursor accessible inside `loadMore` without re-running the
  // callback identity — same trick as `dataRef` in `useAccueilHome`.
  const cursorRef = useRef<string | null>(null);
  useEffect(() => {
    cursorRef.current = cursor;
  }, [cursor]);
  const hasMoreRef = useRef<boolean>(false);
  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  const refetch = useCallback(async (): Promise<void> => {
    if (!enabled) return;
    setIsRefetching(true);
    try {
      const payload = await fetcher({ limit: PAGE_LIMIT });
      setPinnedDiagnostic(payload.pinnedDiagnostic);
      setFeed(payload.feed);
      setCursor(payload.nextCursor);
      setHasMore(payload.nextCursor !== null);
      setIsError(false);
      hasDataRef.current = true;
    } catch {
      if (!hasDataRef.current) {
        setIsError(true);
      }
    } finally {
      setIsRefetching(false);
    }
  }, [enabled, fetcher]);

  const loadMore = useCallback(async (): Promise<void> => {
    if (!enabled) return;
    if (!hasMoreRef.current) return;
    if (cursorRef.current === null) return;
    setIsLoadingMore(true);
    try {
      const payload = await fetcher({
        cursor: cursorRef.current,
        limit: PAGE_LIMIT,
      });
      setFeed((prev) => [...prev, ...payload.feed]);
      setCursor(payload.nextCursor);
      setHasMore(payload.nextCursor !== null);
    } catch {
      // Swallow — caller already has the previous page on screen and a
      // pull-to-refresh covers the recovery path.
    } finally {
      setIsLoadingMore(false);
    }
  }, [enabled, fetcher]);

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    (async () => {
      try {
        const payload = await fetcher({ limit: PAGE_LIMIT });
        if (cancelled) return;
        setPinnedDiagnostic(payload.pinnedDiagnostic);
        setFeed(payload.feed);
        setCursor(payload.nextCursor);
        setHasMore(payload.nextCursor !== null);
        setIsError(false);
        hasDataRef.current = true;
      } catch {
        if (cancelled) return;
        if (!hasDataRef.current) setIsError(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, fetcher]);

  return {
    pinnedDiagnostic,
    feed,
    hasMore,
    isLoading,
    isError,
    isRefetching,
    isLoadingMore,
    refetch,
    loadMore,
  };
}
