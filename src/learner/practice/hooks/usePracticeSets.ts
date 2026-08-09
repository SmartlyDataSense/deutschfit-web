"use client";

/**
 * State seam for the Übungstest picker (§6.5, Task 4.6) — enumerates the
 * published practice sets for the learner's (board, level) + the route's
 * modality, and decorates each with a local progress chip. Web port of
 * `deutschfit-mobile/src/features/practice/hooks/usePracticeSets.ts`.
 *
 * Web deviation from mobile (deliberate, not an oversight): mobile bulk-
 * reads every `practice_progress` row for the module via
 * `listPracticeProgress` and filters in JS — a Dexie/Drizzle-parity
 * workaround the mobile doc comment attributes to `whereEquals` only
 * supporting a single field. Here `fetchPracticeSetsList` has already
 * handed back the exact slugs to decorate, so each set is looked up
 * directly via `loadPracticeProgress`'s composite-key `get` (no bulk scan,
 * no JS filter) — `Promise.all`'d across the (typically 1-3) sets. A
 * per-set lookup failure degrades only that set's chip to «À faire»
 * (mirrors `usePracticeHub`'s "a failed local read degrades to «À
 * faire»" posture, but scoped per-row instead of per-module since each
 * row is an independent read here).
 *
 * Level outside B1/B2 → `unsupported`, no network. A `fetchPracticeSetsList`
 * rejection surfaces as `{status:"error", message}`; `reload()` bumps an
 * internal key to re-run the effect.
 */
import { useCallback, useEffect, useState } from "react";

import { useLearnerSession } from "@/learner/core/auth/useLearnerSession";
import { useExamContextStore } from "@/learner/core/exam/examContext";
import { toPracticeLevel } from "@/learner/core/exam/engine/practiceLevel";
import { fetchPracticeSetsList } from "@/learner/core/api/mockExam";
import type { PracticeSetInfo } from "@/learner/core/api/mockExam";
import { loadPracticeProgress } from "@/learner/core/storage/practiceProgress";

import { deriveChip } from "@/learner/practice/model/progressChip";
import type { PracticeChip } from "@/learner/practice/model/progressChip";
import { MODULE_BY_MODALITY } from "@/learner/practice/model/types";
import type { PracticeModality } from "@/learner/practice/model/types";

export interface PracticeSetRow {
  readonly slug: string;
  readonly title: string;
  readonly ordinal: number;
  readonly chip: PracticeChip;
}

export type PracticeSetsState =
  | { readonly status: "loading" }
  | { readonly status: "unsupported" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "ready"; readonly sets: readonly PracticeSetRow[] };

async function chipForSet(
  set: PracticeSetInfo,
  key: {
    userId: string | null;
    board: string;
    level: string;
    moduleCode: "LESEN" | "SPRACHBAUSTEINE";
  }
): Promise<PracticeChip> {
  if (!key.userId) return { state: "todo" };
  try {
    const record = await loadPracticeProgress({
      userId: key.userId,
      board: key.board,
      level: key.level,
      moduleCode: key.moduleCode,
      quizSlug: set.slug,
    });
    return deriveChip(
      record
        ? {
            lockedCount: Object.keys(record.answers).length,
            totalCount: record.totalCount,
            completedAt: record.completedAt,
          }
        : null
    );
  } catch {
    return { state: "todo" };
  }
}

export function usePracticeSets(modality: PracticeModality): {
  state: PracticeSetsState;
  reload: () => void;
} {
  const board = useExamContextStore((s) => s.board);
  const rawLevel = useExamContextStore((s) => s.level);
  const level = toPracticeLevel(rawLevel);
  const [state, setState] = useState<PracticeSetsState>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!level) {
      setState({ status: "unsupported" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    void (async () => {
      try {
        const moduleCode = MODULE_BY_MODALITY[modality];
        const sets: PracticeSetInfo[] = await fetchPracticeSetsList(level, moduleCode);
        const userId = useLearnerSession.getState().session?.user.id ?? null;
        const rows = await Promise.all(
          sets.map(async (set, index) => ({
            slug: set.slug,
            title: set.title,
            ordinal: index + 1,
            chip: await chipForSet(set, { userId, board, level, moduleCode }),
          }))
        );
        if (!cancelled) {
          setState({ status: "ready", sets: rows });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            status: "error",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [board, level, modality, reloadKey]);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  return { state, reload };
}
