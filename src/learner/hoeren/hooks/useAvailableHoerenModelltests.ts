"use client";

/**
 * `useAvailableHoerenModelltests` — async picker-list loader for the graded
 * Hören intro screen (Task 5.9). Structural template: web
 * `useAvailableLesenModelltests` (Task 4.8, `src/learner/lesen/hooks/
 * useAvailableModelltests.ts`) — same state shape `{data, loading, error,
 * refresh}`. This hook has NO mobile counterpart to port: mobile's
 * `HoerenIntroScreen` (and everything it depended on) is retired (#473
 * legacy) — see the sibling screen's doc comment for the full disclaimer.
 *
 * Goes through `listModelltests({ module: "HOEREN" })` via the
 * `@/learner/core/api/examApi` facade (not `./mockExam` directly) — server
 * orders by slug; this hook re-sorts client-side by `sequence_num` (nulls
 * last, identical comparator to the Lesen hook) for a stable,
 * curriculum-intended picker order.
 *
 * Web delta (P10, binding) — the reason this hook is NOT a straight copy of
 * the Lesen one: dev currently serves 60 HOEREN rows spanning both B1 and
 * B2 with no server-side level filter. This hook applies a CLIENT-SIDE
 * filter on `row.level_code` against the learner's exam-context level,
 * case-insensitive (`level_code` arrives uppercase, e.g. `"B1"`; the
 * store's `level` is lowercase, e.g. `"b1"`) so the picker only ever shows
 * the learner's own track. Because the filter is level-dependent, this
 * hook — unlike Lesen's, which has no board/level dependency at all and
 * therefore nothing to hydrate — self-hydrates the exam-context store AND
 * gates the fetch on `isLoaded` BEFORE calling `listModelltests`. Fetching
 * (and filtering) against the store's un-hydrated default level on a
 * deep-link/hard-refresh would silently show the wrong track's
 * modelltests — the same #473-family hazard `useHoerenSession`'s own
 * hydration-gate doc comment documents. Zero rows surviving the filter is
 * a legitimate, valid state — `data` resolves to `[]` and the screen
 * renders its empty state, not an error.
 */
import { useCallback, useEffect, useState } from "react";

import { listModelltests, type ModelltestRow } from "@/learner/core/api/examApi";
import { hydrateExamContext, useExamContextStore } from "@/learner/core/exam/examContext";

export interface UseAvailableHoerenModelltestsResult {
  readonly data: ModelltestRow[] | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly refresh: () => void;
}

function sortBySequence(rows: readonly ModelltestRow[]): ModelltestRow[] {
  return [...rows].sort((a, b) => {
    const aSeq = a.sequence_num ?? Number.POSITIVE_INFINITY;
    const bSeq = b.sequence_num ?? Number.POSITIVE_INFINITY;
    return aSeq - bSeq;
  });
}

export function useAvailableHoerenModelltests(): UseAvailableHoerenModelltestsResult {
  const level = useExamContextStore((s) => s.level);
  const isExamContextLoaded = useExamContextStore((s) => s.isLoaded);

  const [data, setData] = useState<ModelltestRow[] | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState<number>(0);

  // This route has no ancestor that hydrates the exam-context store — same
  // idiom as `LesenIntroScreen`/`usePracticeSets`/`useHoerenSession`.
  // `hydrateExamContext()` is idempotent/cheap to call again if some other
  // screen already did.
  useEffect(() => {
    void hydrateExamContext();
  }, []);

  useEffect(() => {
    // Hydration gate (P10, binding) — the level filter below is
    // level-dependent, so (unlike the Lesen hook) this one must not fetch
    // until the learner's real exam-context level has landed.
    if (!isExamContextLoaded) {
      setLoading(true);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const rows = await listModelltests({ module: "HOEREN" });
        if (cancelled) return;
        const filtered = rows.filter((row) => row.level_code.toLowerCase() === level.toLowerCase());
        setData(sortBySequence(filtered));
      } catch (err) {
        if (cancelled) return;
        setData(null);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey, isExamContextLoaded, level]);

  const refresh = useCallback((): void => {
    setReloadKey((k) => k + 1);
  }, []);

  return { data, loading, error, refresh };
}
