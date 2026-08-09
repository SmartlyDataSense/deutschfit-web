"use client";

/**
 * Chips for the Übungen hub (§6.5), derived from the on-device
 * `practice_progress` Dexie table for the learner's (board, level). No
 * network — the hub renders instantly with no skeleton, an unsupported
 * level short-circuits before any read, and a failed IndexedDB read
 * degrades to «À faire».
 *
 * Port of `deutschfit-mobile/src/features/practice/hooks/usePracticeHub.ts`.
 * Web adaptation (mobile refreshes on `useFocusEffect`, which has no web
 * equivalent): this hook refreshes once on mount, then again on every
 * `document.visibilitychange` transition to `"visible"` — the stated web
 * analogue of "re-derive on every screen focus" (locks persist per pick
 * inside the session, so a learner returning to this tab after
 * completing a practice session in another tab/window sees fresh chips).
 *
 * `PracticeHubChips`/`MODALITIES` cover only `TextPracticeModality`
 * (Lesen, Sprachbausteine) — Hören has no row here because it persists no
 * `practice_progress` row to derive a chip from (P13); its hub row
 * hardcodes a "todo" chip instead (see `PracticeHubScreen`).
 */
import { useCallback, useEffect, useState } from "react";

import { useLearnerSession } from "@/learner/core/auth/useLearnerSession";
import { useExamContextStore } from "@/learner/core/exam/examContext";
import { toPracticeLevel } from "@/learner/core/exam/engine/practiceLevel";
import { listPracticeProgress } from "@/learner/core/storage/practiceProgress";

import { deriveChip } from "@/learner/practice/model/progressChip";
import type { PracticeChip } from "@/learner/practice/model/progressChip";
import { MODULE_BY_MODALITY } from "@/learner/practice/model/types";
import type { TextPracticeModality } from "@/learner/practice/model/types";

export interface PracticeHubChips {
  readonly lesen: PracticeChip;
  readonly sprachbausteine: PracticeChip;
}

export interface PracticeHubState {
  readonly supported: boolean;
  readonly chips: PracticeHubChips;
}

const MODALITIES: readonly TextPracticeModality[] = ["lesen", "sprachbausteine"];

const TODO_CHIPS: PracticeHubChips = {
  lesen: { state: "todo" },
  sprachbausteine: { state: "todo" },
};

export function usePracticeHub(): PracticeHubState {
  const board = useExamContextStore((s) => s.board);
  const rawLevel = useExamContextStore((s) => s.level);
  const level = toPracticeLevel(rawLevel);
  const [chips, setChips] = useState<PracticeHubChips>(TODO_CHIPS);

  const refresh = useCallback(async (): Promise<void> => {
    if (!level) return;
    const userId = useLearnerSession.getState().session?.user.id ?? null;
    if (!userId) return;
    try {
      const rows = await listPracticeProgress(userId, board, level);
      const next: { lesen: PracticeChip; sprachbausteine: PracticeChip } = {
        lesen: { state: "todo" },
        sprachbausteine: { state: "todo" },
      };
      for (const modality of MODALITIES) {
        const latest = rows
          .filter((r) => r.moduleCode === MODULE_BY_MODALITY[modality])
          .sort((a, b) => b.updatedAt - a.updatedAt)[0];
        next[modality] = deriveChip(
          latest
            ? {
                lockedCount: Object.keys(latest.answers).length,
                totalCount: latest.totalCount,
                completedAt: latest.completedAt ?? null,
              }
            : null
        );
      }
      setChips(next);
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[usePracticeHub] listPracticeProgress failed:", err);
      }
      setChips(TODO_CHIPS);
    }
  }, [board, level]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const handleVisibilityChange = (): void => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [refresh]);

  return { supported: level !== null, chips };
}
