"use client";

/**
 * State seam for the shared untimed practice session (§6.6, Task 4.7). Web
 * port of `deutschfit-mobile/src/features/practice/hooks/usePracticeSession.ts`.
 *
 * - Fetches the practice payload for the user's (board, level) and the
 *   route's modality; level outside B1/B2 → `unsupported`, NO network.
 * - Builds the session with the REUSED `buildSession`; `ExamPart` drops
 *   `reading_texts`, so the hook re-indexes them by slug for renderers.
 *   `transcript_md` is nullable on the wire; `ReadingTextInfo.body` is not
 *   (web deviation from mobile's nullable `body`) — a `null` transcript
 *   coerces to `""` here so renderers never have to null-check it.
 * - Hydrates first-pick locks from `practice_progress` and persists on
 *   every lock/reset, keyed by `session.examSlug` (the slug the server
 *   actually served) — both the picker path (`?slug=`) and the default
 *   path persist to the same row.
 * - `pick` is computed from closure state, NOT inside a `setState`
 *   updater — persistence must run exactly once per lock.
 * - Deliberately NOT importing `useExamTimer` (untimed) and NOT importing
 *   anything from Hören/Schreiben surfaces (feature isolation, H4 parity).
 */
import { useCallback, useEffect, useState } from "react";

import {
  fetchLesenPracticeSession,
  fetchSprachbausteinePracticeSession,
} from "@/learner/core/api/mockExam";
import { useLearnerSession } from "@/learner/core/auth/useLearnerSession";
import { useExamContextStore } from "@/learner/core/exam/examContext";
import { buildSession } from "@/learner/core/exam/engine/loadModel";
import { toPracticeLevel } from "@/learner/core/exam/engine/practiceLevel";
import type { ExamItem, ExamPart, ExamSession } from "@/learner/core/exam/engine/types";
import {
  loadPracticeProgress,
  savePracticeProgress,
} from "@/learner/core/storage/practiceProgress";

import { isSessionComplete, lockPick, resetPart } from "@/learner/practice/model/lockState";
import type { LockMap } from "@/learner/practice/model/lockState";
import { MODULE_BY_MODALITY } from "@/learner/practice/model/types";
import type { PracticeModality } from "@/learner/practice/model/types";

export interface ReadingTextInfo {
  readonly label: string;
  readonly body: string;
}

export type PracticeSessionState =
  | { readonly status: "loading" }
  | { readonly status: "unsupported" }
  | { readonly status: "error"; readonly message: string }
  | {
      readonly status: "ready";
      readonly session: ExamSession;
      readonly readingTexts: Readonly<Record<string, ReadingTextInfo>>;
      readonly locks: LockMap;
      readonly complete: boolean;
    };

const FETCH_BY_MODALITY = {
  lesen: fetchLesenPracticeSession,
  sprachbausteine: fetchSprachbausteinePracticeSession,
} as const;

export function usePracticeSession(
  modality: PracticeModality,
  slug?: string
): {
  state: PracticeSessionState;
  pick: (item: ExamItem, pickedKey: string) => void;
  restartPart: (part: ExamPart) => void;
  reload: () => void;
} {
  const board = useExamContextStore((s) => s.board);
  const rawLevel = useExamContextStore((s) => s.level);
  const level = toPracticeLevel(rawLevel);
  const [state, setState] = useState<PracticeSessionState>({ status: "loading" });
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
        // `slug` pins a specific Übungstest (set picker); omitted → the
        // server's slug-asc default. Progress stays keyed by the slug the
        // server actually served (session.examSlug), so both paths persist
        // to the same row.
        const payload = await FETCH_BY_MODALITY[modality](level, slug);
        const session = buildSession({ manifest: payload.manifest, module: payload.module });
        const readingTexts: Record<string, ReadingTextInfo> = {};
        for (const part of payload.module.parts) {
          for (const text of part.reading_texts ?? []) {
            readingTexts[text.slug] = { label: text.label, body: text.transcript_md ?? "" };
          }
        }
        const userId = useLearnerSession.getState().session?.user.id ?? null;
        const row = userId
          ? await loadPracticeProgress({
              userId,
              board,
              level,
              moduleCode: MODULE_BY_MODALITY[modality],
              quizSlug: session.examSlug,
            })
          : null;
        const locks: LockMap = row?.answers ?? {};
        if (!cancelled) {
          setState({
            status: "ready",
            session,
            readingTexts,
            locks,
            complete: isSessionComplete(locks, session),
          });
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
  }, [board, level, modality, reloadKey, slug]);

  const persistLocks = useCallback(
    (session: ExamSession, locks: LockMap, complete: boolean) => {
      const userId = useLearnerSession.getState().session?.user.id ?? null;
      if (!userId || !level) return;
      const now = Date.now();
      // Best-effort local write — a failed persist must never crash the
      // session (mirrors mobile's useDrillSession.writeSummary).
      void savePracticeProgress({
        userId,
        board,
        level,
        moduleCode: MODULE_BY_MODALITY[modality],
        quizSlug: session.examSlug,
        answers: { ...locks },
        correctCount: Object.values(locks).filter((entry) => entry.correct).length,
        totalCount: session.parts.reduce((count, part) => count + part.items.length, 0),
        completedAt: complete ? now : null,
        updatedAt: now,
      }).catch((error) => {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[practice] progress persist failed", error);
        }
      });
    },
    [board, level, modality]
  );

  // Computed from closure state, NOT inside a setState updater —
  // persistence must run exactly once per lock (parity note P11).
  const pick = useCallback(
    (item: ExamItem, pickedKey: string) => {
      if (state.status !== "ready") return;
      const nextLocks = lockPick(state.locks, item, pickedKey);
      if (nextLocks === state.locks) return;
      const complete = isSessionComplete(nextLocks, state.session);
      setState({ ...state, locks: nextLocks, complete });
      persistLocks(state.session, nextLocks, complete);
    },
    [state, persistLocks]
  );

  const restartPart = useCallback(
    (part: ExamPart) => {
      if (state.status !== "ready") return;
      const nextLocks = resetPart(state.locks, part);
      setState({ ...state, locks: nextLocks, complete: false });
      persistLocks(state.session, nextLocks, false);
    },
    [state, persistLocks]
  );

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  return { state, pick, restartPart, reload };
}
