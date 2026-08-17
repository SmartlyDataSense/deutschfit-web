/**
 * Onboarding answers — session-local zustand store.
 *
 * The wizard collects 2 answers (motivation, schedule). CEFR level is
 * captured separately via `ExamTypeScreen` and persisted to `useExamContext`,
 * so it is not duplicated here. The `goal` field was removed (PR-D,
 * 2026-05-07) — exam board + level captured in `ExamTypeScreen` make the
 * redundant goal picker dead weight. In v0 we keep answers in memory only —
 * we don't yet post them anywhere. The last actionable step
 * (`ScheduleScreen`) auto-finishes via `useFinishOnboarding`, which marks
 * the per-user `@deutschfit/onboarding-done` flag (see `useOnboardingFlag`);
 * the root navigator subscribes to that store and re-renders into MainTabs
 * as soon as the flag flips. There is no longer a celebration screen
 * between the last answer and the first useful action (sh-6,
 * founding-doc §17 + §3).
 *
 * Keeping answers in a zustand store (rather than route params) means the
 * user can navigate back without losing their previous selections. Only
 * Schedule (the wizard's actual last step) runs the finalize sequence on
 * "Ignorer" — Motivation's "Ignorer" just advances to Schedule without
 * threading state through a `router.push` (#53: Motivation is step 2/3,
 * not the last step, so skipping it must not end onboarding).
 */
import { create } from "zustand";

export type OnboardingMotivation = "travel" | "work" | "studies" | "immigration" | "other";
export type OnboardingSchedule = "5" | "10" | "20" | "30" | "45" | "60";

export type OnboardingAnswers = {
  motivation: OnboardingMotivation | null;
  schedule: OnboardingSchedule | null;
};

type OnboardingAnswersState = OnboardingAnswers & {
  setMotivation: (m: OnboardingMotivation) => void;
  setSchedule: (s: OnboardingSchedule) => void;
  reset: () => void;
};

const EMPTY: OnboardingAnswers = {
  motivation: null,
  schedule: null,
};

export const useOnboardingAnswers = create<OnboardingAnswersState>((set) => ({
  ...EMPTY,
  setMotivation: (motivation) => set({ motivation }),
  setSchedule: (schedule) => set({ schedule }),
  reset: () => set(EMPTY),
}));
