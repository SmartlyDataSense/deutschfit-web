/**
 * `useDailyDrill` — loads the learner's daily-drill recommendation for the
 * Accueil home card from the `drill-recommend` edge function (`home_daily`
 * surface), via the `@/learner/core/api/dailyDrill` client.
 *
 * Ports `deutschfit-mobile/src/features/accueil/hooks/useDailyDrill.ts`
 * verbatim (S3 · Task 3.6) — zero RN imports, only the client import path
 * changes (`@core/api/dailyDrill` → `@/learner/core/api/dailyDrill`).
 *
 * The home `PriorityTaskCard` is the drill-gap recommender's entry point:
 * when the engine reports `reason === "ok"` with at least one item, the
 * card surfaces an active "exercices du jour" CTA that opens the
 * `DrillSession` modal; otherwise it shows the calm empty state. The card
 * only needs the count + reason, so the hook returns the narrow
 * `DailyDrillRecommendation` envelope rather than the drill items.
 *
 * Mirrors the `useState` / `useEffect` idiom of `useAccueilHome` (no
 * TanStack Query — the codebase doesn't depend on it):
 *   - `recommendation` — latest envelope, or `null` until the first fetch
 *                        resolves. A failed refetch keeps the previous
 *                        snapshot so the card doesn't regress mid-session.
 *   - `isLoading`      — `true` only during the *initial* fetch (no cached
 *                        recommendation yet); the home screen shows a
 *                        skeleton placeholder while this holds, so the
 *                        card never flickers empty→active.
 *   - `refetch`        — imperative handle wired to pull-to-refresh.
 *
 * The client already collapses transport failures to
 * `{ itemCount: 0, reason: "error" }`, so the hook never surfaces a thrown
 * error — `reason` carries the empty/unsupported/error signal and the card
 * routes every non-`ok` outcome to the same empty branch.
 */
import { useCallback, useEffect, useState } from "react";

import { fetchDailyDrill, type DailyDrillRecommendation } from "@/learner/core/api/dailyDrill";

export interface UseDailyDrillResult {
  readonly recommendation: DailyDrillRecommendation | null;
  readonly isLoading: boolean;
  readonly isRefetching: boolean;
  readonly refetch: () => Promise<void>;
}

export interface UseDailyDrillArgs {
  /** Disable automatic fetch (e.g. during logic-only tests). */
  readonly enabled?: boolean;
  /** Items to request from the `home_daily` surface (teaser cap). */
  readonly maxItems?: number;
  readonly deps?: {
    readonly fetchDailyDrill?: typeof fetchDailyDrill;
  };
}

export function useDailyDrill(args: UseDailyDrillArgs = {}): UseDailyDrillResult {
  const enabled = args.enabled ?? true;
  const maxItems = args.maxItems ?? 5;
  const fetcher = args.deps?.fetchDailyDrill ?? fetchDailyDrill;

  const [recommendation, setRecommendation] = useState<DailyDrillRecommendation | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(enabled);
  const [isRefetching, setIsRefetching] = useState<boolean>(false);

  // A failed fetch never throws here — `fetchDailyDrill` collapses
  // transport errors into `{ itemCount: 0, reason: "error" }` — so `reason`
  // carries the signal and there's no try/catch. On a *refetch* (we already
  // showed a card), a transient `error` envelope is swallowed via a
  // functional update so a network blip during pull-to-refresh doesn't wipe
  // a previously-good recommendation. Empty *reasons* (`no_gaps_yet`, …) are
  // legitimate state changes and always replace the previous snapshot.
  const refetch = useCallback(async (): Promise<void> => {
    if (!enabled) return;
    setIsRefetching(true);
    try {
      const next = await fetcher(maxItems);
      setRecommendation((prev) => (next.reason === "error" && prev !== null ? prev : next));
    } catch {
      // `fetchDailyDrill` collapses transport errors into a `reason: "error"`
      // envelope, so a throw here is unexpected (e.g. a malformed client).
      // Belt-and-braces, mirroring `useAccueilHome`: never let it escape the
      // hook. Keep any prior snapshot; otherwise fall back to the calm error
      // envelope so the card never regresses mid-session.
      setRecommendation((prev) => prev ?? { itemCount: 0, reason: "error" });
    } finally {
      setIsRefetching(false);
    }
  }, [enabled, fetcher, maxItems]);

  // Initial load on mount + whenever the injected fetcher changes (tests).
  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    (async () => {
      try {
        const next = await fetcher(maxItems);
        if (cancelled) return;
        setRecommendation(next);
      } catch {
        if (cancelled) return;
        // Mirror `useAccueilHome`: a thrown fetch never escapes the hook.
        // Fall back to the calm error envelope so the card exits the skeleton
        // and renders the empty branch instead of hanging on a `null`.
        setRecommendation((prev) => prev ?? { itemCount: 0, reason: "error" });
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, fetcher, maxItems]);

  return { recommendation, isLoading, isRefetching, refetch };
}
