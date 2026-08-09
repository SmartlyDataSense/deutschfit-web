/**
 * State machine for an MCQ player. Owns the answer map, the cursor through
 * the flat list of items, and the submit/grade transition.
 *
 * Verbatim port of `deutschfit-mobile/src/core/exam/useExamPlayer.ts`.
 *
 * This is feature-agnostic: Lesen and Hören both consume it. Each feature
 * supplies its own session-loader and submit-API hook on top.
 *
 * The core is a pure reducer (`examPlayerReducer` + `createInitialExamPlayerState`)
 * so the state machine can be unit-tested under Node with no React renderer.
 */
import { useCallback, useMemo, useReducer } from "react";

import { countAnswered, scoreSession, type AnswerMap, type SessionScore } from "./scoring";
import type { ExamItem, ExamSession } from "./types";

export interface FlatItem {
  readonly partId: string;
  readonly partLabel: string;
  readonly partInstructions: string;
  readonly item: ExamItem;
}

export interface ExamPlayerSnapshot {
  readonly answers: AnswerMap;
  readonly currentIndex: number;
  readonly score: SessionScore | null;
}

export type ExamPlayerAction =
  | { readonly type: "pick"; readonly itemId: string; readonly key: string }
  | { readonly type: "goNext" }
  | { readonly type: "goPrev" }
  | { readonly type: "goTo"; readonly index: number }
  | { readonly type: "submit" }
  | { readonly type: "reset" };

export interface ExamPlayerState extends ExamPlayerSnapshot {
  readonly session: ExamSession;
  readonly items: readonly FlatItem[];
  readonly current: FlatItem | null;
  readonly answeredCount: number;
  readonly totalCount: number;
  readonly isFirst: boolean;
  readonly isLast: boolean;
  readonly isSubmitted: boolean;
  pick(itemId: string, key: string): void;
  goNext(): void;
  goPrev(): void;
  goTo(index: number): void;
  submit(): SessionScore;
  reset(): void;
}

export function flattenSession(session: ExamSession): FlatItem[] {
  const out: FlatItem[] = [];
  for (const part of session.parts) {
    for (const item of part.items) {
      out.push({
        partId: part.id,
        partLabel: part.label,
        partInstructions: part.instructions,
        item,
      });
    }
  }
  return out;
}

export function createInitialExamPlayerState(): ExamPlayerSnapshot {
  return { answers: {}, currentIndex: 0, score: null };
}

function totalItemCount(session: ExamSession): number {
  let n = 0;
  for (const part of session.parts) n += part.items.length;
  return n;
}

function clampIndex(index: number, totalCount: number): number {
  const upper = Math.max(0, totalCount - 1);
  return Math.min(Math.max(0, index), upper);
}

/**
 * Pure state transition. `session` is passed as a third argument rather than
 * baked into state so the session reference can rotate (e.g. when a user
 * restarts) without losing history correctness.
 */
export function examPlayerReducer(
  state: ExamPlayerSnapshot,
  action: ExamPlayerAction,
  session: ExamSession
): ExamPlayerSnapshot {
  const totalCount = totalItemCount(session);
  switch (action.type) {
    case "pick":
      return {
        ...state,
        answers: { ...state.answers, [action.itemId]: action.key },
      };
    case "goNext":
      return {
        ...state,
        currentIndex: clampIndex(state.currentIndex + 1, totalCount),
      };
    case "goPrev":
      return {
        ...state,
        currentIndex: clampIndex(state.currentIndex - 1, totalCount),
      };
    case "goTo":
      return { ...state, currentIndex: clampIndex(action.index, totalCount) };
    case "submit":
      return { ...state, score: scoreSession(session, state.answers) };
    case "reset":
      return createInitialExamPlayerState();
  }
}

export function useExamPlayer(session: ExamSession): ExamPlayerState {
  const items = useMemo(() => flattenSession(session), [session]);
  const totalCount = items.length;

  const reducer = useCallback(
    (state: ExamPlayerSnapshot, action: ExamPlayerAction) =>
      examPlayerReducer(state, action, session),
    [session]
  );

  const [snapshot, dispatch] = useReducer(reducer, undefined, createInitialExamPlayerState);

  const current = items[snapshot.currentIndex] ?? null;
  const answeredCount = useMemo(
    () => countAnswered(session, snapshot.answers),
    [session, snapshot.answers]
  );

  const pick = useCallback(
    (itemId: string, key: string) => dispatch({ type: "pick", itemId, key }),
    []
  );
  const goNext = useCallback(() => dispatch({ type: "goNext" }), []);
  const goPrev = useCallback(() => dispatch({ type: "goPrev" }), []);
  const goTo = useCallback((index: number) => dispatch({ type: "goTo", index }), []);

  const submit = useCallback((): SessionScore => {
    const next = scoreSession(session, snapshot.answers);
    dispatch({ type: "submit" });
    return next;
  }, [session, snapshot.answers]);

  const reset = useCallback(() => dispatch({ type: "reset" }), []);

  return {
    session,
    items,
    currentIndex: snapshot.currentIndex,
    current,
    answers: snapshot.answers,
    answeredCount,
    totalCount,
    isFirst: snapshot.currentIndex === 0,
    isLast: snapshot.currentIndex >= totalCount - 1,
    isSubmitted: snapshot.score !== null,
    score: snapshot.score,
    pick,
    goNext,
    goPrev,
    goTo,
    submit,
    reset,
  };
}
