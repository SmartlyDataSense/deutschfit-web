/**
 * `useTopicHandoff` — non-persisted zustand handoff store (S7 Task 7.6,
 * parity note P18).
 *
 * Mobile passes the full curated topic envelope through React Navigation
 * params (`navigation.navigate("Session", { topicId, pickerSubgenre, ... })`
 * — `deutschfit-mobile/src/features/sprechen/screens/TopicPickerScreen.tsx:283-294`).
 * The web route puts only `topicId` in the URL (spec §4:
 * `/sprechen/session/[topicId]`), so `TopicPickerScreen` writes the
 * selected `TopicCard` here immediately before pushing the session route,
 * and `SprechenSessionScreen` (Task 7.8) reads it on mount to synthesize
 * the prompt without a second network round-trip.
 *
 * This store is intentionally NOT persisted (no localStorage/Dexie
 * backing): a refresh or deep-link straight onto `/sprechen/session/:id`
 * finds `topic: null` here by design, and the session screen's documented
 * fallback is to refetch `topics-list` unfiltered and find the row by id
 * (P18) — never to resurrect a stale handoff from a previous session.
 * `createTopic` (7.7, `CustomTopicScreen`) seeds this same store from its
 * 201 response before navigating, same handoff contract.
 */
import { create } from "zustand";

import type { TopicCard } from "@/learner/core/api/examApi";

interface TopicHandoffStore {
  readonly topic: TopicCard | null;
  readonly setTopic: (topic: TopicCard) => void;
  readonly clear: () => void;
}

export const useTopicHandoff = create<TopicHandoffStore>((set) => ({
  topic: null,
  setTopic: (topic: TopicCard) => set({ topic }),
  clear: () => set({ topic: null }),
}));
