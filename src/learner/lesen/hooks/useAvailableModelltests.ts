"use client";

/**
 * `useAvailableLesenModelltests` — async picker-list loader for the graded
 * Lesen intro screen (Task 4.8). Web port of
 * `deutschfit-mobile/src/features/lesen/hooks/useAvailableModelltests.ts`
 * (file name kept `useAvailableModelltests.ts`, export name kept
 * `useAvailableLesenModelltests` — mobile parity, verbatim).
 *
 * Goes through `listModelltests({ module: "LESEN" })` — server orders by
 * slug; this hook re-sorts client-side by `sequence_num` (nulls last, via
 * the same `Number.POSITIVE_INFINITY` comparator mobile uses) so the
 * picker renders in a stable, curriculum-intended order regardless of the
 * server's slug-asc default.
 *
 * Interface deviation from mobile (intentional, per Task 4.8 brief — not
 * an oversight): mobile returns `{ data: readonly ModelltestRow[]; error:
 * Error | null; refresh: () => Promise<void> }` (empty-array default,
 * typed error, async refresh). This hook returns `{ data: ModelltestRow[]
 * | null; error: string | null; refresh: () => void }` — `null` before the
 * first successful fetch (so the screen can distinguish "still loading /
 * never fetched" from "fetched, zero rows"), a plain message string (the
 * screen doesn't need the `Error` object, only `.message`), and a
 * synchronous `refresh` (bumps a reload key; the effect re-runs — no
 * caller needs to await it, matching `usePracticeSets`/`usePracticeSession`
 * on this same repo).
 *
 * On failure `data` resets to `null` and `error` carries the message — the
 * screen renders the error state whenever `error` is set, same posture as
 * `usePracticeSets`'s `{status:"error", message}` branch.
 *
 * No exam-context (board/level) dependency here — `modelltests-list`
 * filters by `module` only (board branding is hidden from the picker per
 * `formatExamTrackLabel`'s F-3 rationale), so this hook has nothing to
 * hydrate. `LesenIntroScreen` still self-hydrates the exam-context store
 * for the eyebrow track label / `formatLesenModuleShape(level)` card meta
 * it renders alongside this hook's data — see that screen's doc comment.
 */
import { useCallback, useEffect, useState } from "react";

import { listModelltests, type ModelltestRow } from "@/learner/core/api/examApi";

export interface UseAvailableLesenModelltestsResult {
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

export function useAvailableLesenModelltests(): UseAvailableLesenModelltestsResult {
  const [data, setData] = useState<ModelltestRow[] | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const rows = await listModelltests({ module: "LESEN" });
        if (cancelled) return;
        setData(sortBySequence(rows));
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
  }, [reloadKey]);

  const refresh = useCallback((): void => {
    setReloadKey((k) => k + 1);
  }, []);

  return { data, loading, error, refresh };
}
