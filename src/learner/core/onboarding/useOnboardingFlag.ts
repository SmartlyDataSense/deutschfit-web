import { create } from "zustand";
import {
  getFlag,
  learnerOnboardingDoneKeyFor,
  removeFlag,
  setFlag,
} from "@/learner/core/storage/flags";

function isUsableUserId(userId: string | null | undefined): userId is string {
  return typeof userId === "string" && userId.length > 0;
}

export function readOnboardingDoneFor(userId: string | null | undefined): boolean {
  if (!isUsableUserId(userId)) return false;
  return getFlag(learnerOnboardingDoneKeyFor(userId)) === "true";
}
export function markOnboardingDoneFor(userId: string | null | undefined): void {
  if (!isUsableUserId(userId)) return;
  setFlag(learnerOnboardingDoneKeyFor(userId), "true");
}
export function resetOnboardingFor(userId: string | null | undefined): void {
  if (!isUsableUserId(userId)) return;
  removeFlag(learnerOnboardingDoneKeyFor(userId));
}

type OnboardingFlagStore = {
  userId: string | null;
  done: boolean;
  hydrated: boolean;
  hydrateFor: (userId: string | null) => void;
  markDone: () => void;
  reset: () => void;
};

export const useOnboardingFlagStore = create<OnboardingFlagStore>((set, get) => ({
  userId: null,
  done: false,
  hydrated: false,
  hydrateFor: (userId) => {
    if (!isUsableUserId(userId)) {
      set({ userId: null, done: false, hydrated: true });
      return;
    }
    set({ userId, done: readOnboardingDoneFor(userId), hydrated: true });
  },
  markDone: () => {
    const { userId } = get();
    if (!isUsableUserId(userId)) return;
    markOnboardingDoneFor(userId);
    set({ done: true });
  },
  reset: () => {
    const { userId } = get();
    if (isUsableUserId(userId)) resetOnboardingFor(userId);
    set({ done: false });
  },
}));
