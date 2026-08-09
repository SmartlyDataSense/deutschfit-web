/**
 * `useDialogueResult` — non-persisted zustand result store (S7 · Task 7.10,
 * Constraint 1).
 *
 * `sprechen-dialogue-finalize` is NOT idempotent server-side (unlike
 * `sprechen-finalize`, which returns a `replay: true` flag on a repeat
 * call — see `./api.ts`/`../../core/api/sprechen.ts::finalize`) — a second
 * call against an already-`complete` session is expected to fail. This
 * store exists purely so the ONE successful `finalizeDialogue` 200 that
 * `useDialogueSession` receives survives the navigation from the session
 * screen to the feedback screen without a second network round-trip or a
 * URL-carried payload.
 *
 * Deliberately NOT persisted (no localStorage/Dexie backing) — same
 * non-persistence rationale as `../topicHandoffStore.ts` (P18): a hard
 * refresh or a deep-link straight onto the feedback route finds
 * `result: null` here by design. Refresh loses the result on purpose —
 * the feedback screen's cold-`null` fallback must send the learner back
 * to the picker, never attempt a second `finalizeDialogue` call against a
 * session the server already closed.
 */
import { create } from "zustand";

import type { DialogueResult } from "@/learner/core/api/examApi";

interface DialogueResultStore {
  readonly result: DialogueResult | null;
  readonly setResult: (result: DialogueResult) => void;
  readonly clear: () => void;
}

export const useDialogueResult = create<DialogueResultStore>((set) => ({
  result: null,
  setResult: (result: DialogueResult) => set({ result }),
  clear: () => set({ result: null }),
}));
