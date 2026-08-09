/**
 * `useAccueilHome` — loads the Accueil home-screen payload from the
 * `accueil-home` edge function.
 *
 * Ports `deutschfit-mobile/src/features/accueil/hooks/useAccueilHome.ts`
 * verbatim (S3 · Task 3.6) — zero RN imports, only the client import path
 * changes (`../api`, matching this repo's `@/learner/accueil/api`).
 *
 * Mirrors the `useState` / `useEffect` idiom used elsewhere in this repo
 * rather than introducing TanStack Query, which the codebase does not
 * depend on.
 *
 * Surface (task-brief contract):
 *   - `data`          — latest payload, or `null` until the first fetch
 *                       resolves. Never flips back to `null` after a
 *                       successful fetch — a failed refetch keeps the
 *                       previous snapshot so the screen stays stable.
 *   - `isLoading`     — `true` only during the *initial* fetch (no cached
 *                       payload yet). A later `refetch()` flips
 *                       `isRefetching` instead so the skeleton doesn't
 *                       replace the already-rendered content.
 *   - `isRefetching`  — `true` while a user-initiated `refetch()` is in
 *                       flight. Wired to the pull-to-refresh affordance
 *                       on the home screen's scroll view.
 *   - `isError`       — `true` when the most recent fetch failed *and*
 *                       we have no previous payload to fall back to.
 *   - `refetch`       — imperative handle for pull-to-refresh + any
 *                       future focus-triggered revalidation. Returns
 *                       void; errors are swallowed into `isError`.
 *
 * Cancellation: each in-flight fetch owns a `cancelled` flag scoped to
 * the effect closure. Unmount or a superseding refetch drops the write.
 *
 * Auth: the request is executed through `invokeFn` inside
 * `fetchAccueilHome`, which threads the caller's JWT automatically.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { fetchAccueilHome, type AccueilHomePayload } from "../api";

export interface UseAccueilHomeResult {
  readonly data: AccueilHomePayload | null;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly isRefetching: boolean;
  readonly refetch: () => Promise<void>;
}

export interface UseAccueilHomeArgs {
  /** Disable automatic fetch (e.g. during logic-only tests). */
  readonly enabled?: boolean;
  readonly deps?: {
    readonly fetchAccueilHome?: typeof fetchAccueilHome;
  };
}

export function useAccueilHome(args: UseAccueilHomeArgs = {}): UseAccueilHomeResult {
  const enabled = args.enabled ?? true;
  const fetcher = args.deps?.fetchAccueilHome ?? fetchAccueilHome;

  const [data, setData] = useState<AccueilHomePayload | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(enabled);
  const [isError, setIsError] = useState<boolean>(false);
  const [isRefetching, setIsRefetching] = useState<boolean>(false);

  // Track the latest `data` synchronously so `refetch()` can decide whether
  // a fresh failure should flip `isError` (no cache) or be swallowed (we
  // already have a valid payload on screen).
  const dataRef = useRef<AccueilHomePayload | null>(null);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  // Imperative refetch — powers pull-to-refresh on the home screen and
  // any future focus-triggered revalidation. A failed refetch keeps the
  // previous `data` on screen (`isError` stays `false`) so the UI never
  // regresses into a skeleton after a successful first load.
  const refetch = useCallback(async (): Promise<void> => {
    if (!enabled) return;
    setIsRefetching(true);
    try {
      const payload = await fetcher();
      setData(payload);
      setIsError(false);
    } catch {
      if (dataRef.current === null) {
        setIsError(true);
      }
    } finally {
      setIsRefetching(false);
    }
  }, [enabled, fetcher]);

  // Initial load on mount + whenever the injected fetcher changes (tests).
  // The effect owns a `cancelled` flag so an unmount before the first
  // response doesn't try to setState on a dead component.
  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    (async () => {
      try {
        const payload = await fetcher();
        if (cancelled) return;
        setData(payload);
        setIsError(false);
      } catch {
        if (cancelled) return;
        if (dataRef.current === null) {
          setIsError(true);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, fetcher]);

  return { data, isLoading, isError, isRefetching, refetch };
}
