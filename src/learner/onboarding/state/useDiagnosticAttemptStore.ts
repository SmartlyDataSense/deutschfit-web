/**
 * Diagnostic v2 — in-flight attempt state.
 *
 * Holds the section-grouped questions, the user's answer log, and the
 * per-section elapsed time so the screen can render without re-fetching
 * (and `submitDiagnostic` can post a stable `clientMeta` payload).
 *
 * The store resets on `reset()` whenever a new attempt is mounted; we
 * don't persist across app restarts in beta (spec §3.9).
 */
import { create } from "zustand";

import type {
  DiagnosticSectionKind,
  DiagnosticQuestionsResponse,
} from "../services/getDiagnosticQuestions";
import type { SubmitDiagnosticResult } from "../services/submitDiagnostic";
import {
  toDiagnosticViewModel,
  type DiagnosticViewModel,
  type SequencedQuestion,
} from "../services/diagnosticAdapter";

export type AttemptStatus =
  | "idle"
  | "loading"
  | "in_progress"
  | "submitting"
  | "submitted"
  | "error";

interface StateCore {
  readonly attemptId: string | null;
  readonly viewModel: DiagnosticViewModel | null;
  readonly currentIndex: number; // 0-based across all 15
  readonly answers: Readonly<Record<string, string>>;
  readonly elapsedSecPerSection: Readonly<Record<DiagnosticSectionKind, number>>;
  readonly status: AttemptStatus;
  readonly errorCode: string | null;
  readonly result: SubmitDiagnosticResult | null;
}

interface Actions {
  hydrate: (dto: DiagnosticQuestionsResponse) => void;
  recordAnswer: (questionId: string, optionKey: string) => void;
  advance: () => void;
  setElapsed: (kind: DiagnosticSectionKind, sec: number) => void;
  setStatus: (status: AttemptStatus, errorCode?: string | null) => void;
  setResult: (result: SubmitDiagnosticResult) => void;
  reset: () => void;
}

const EMPTY: StateCore = {
  attemptId: null,
  viewModel: null,
  currentIndex: 0,
  answers: {},
  elapsedSecPerSection: { lesen: 0, sprachbausteine: 0, wortschatz: 0 },
  status: "idle",
  errorCode: null,
  result: null,
};

export const useDiagnosticAttemptStore = create<StateCore & Actions>((set) => ({
  ...EMPTY,
  hydrate: (dto) =>
    set({
      attemptId: dto.attemptId,
      viewModel: toDiagnosticViewModel(dto),
      currentIndex: 0,
      answers: {},
      elapsedSecPerSection: { lesen: 0, sprachbausteine: 0, wortschatz: 0 },
      status: "in_progress",
      errorCode: null,
      result: null,
    }),
  recordAnswer: (questionId, optionKey) =>
    set((s) => ({ answers: { ...s.answers, [questionId]: optionKey } })),
  advance: () => set((s) => ({ currentIndex: s.currentIndex + 1 })),
  setElapsed: (kind, sec) =>
    set((s) => ({
      elapsedSecPerSection: { ...s.elapsedSecPerSection, [kind]: sec },
    })),
  setStatus: (status, errorCode = null) => set({ status, errorCode }),
  setResult: (result) => set({ result, status: "submitted" }),
  reset: () => set(EMPTY),
}));

export function selectCurrentQuestion(
  vm: DiagnosticViewModel | null,
  index: number
): SequencedQuestion | null {
  if (!vm) return null;
  return vm.questions[index] ?? null;
}
