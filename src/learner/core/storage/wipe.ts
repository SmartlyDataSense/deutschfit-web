/**
 * Local-state wipe on account deletion — web port of
 * `deutschfit-mobile/src/core/storage/wipe.ts`.
 *
 * S11-D12: web clears ALL learner tables (mobile clears its 7) — the
 * web-only tables hold user data too and must not survive deletion.
 * The language key is deliberately NOT removed (mobile parity: device
 * language is not account data).
 */
import { getLearnerDb } from "../db";
import { LEARNER_TABLE_NAMES } from "../db/schema";
import { EXAM_CONTEXT_STORAGE_KEY } from "../exam/examContext";
import {
  LEARNER_ONBOARDING_DONE_LEGACY_KEY,
  SERVER_ACK_QUEUE_KEY,
  learnerCoachOpenerSeenKeyFor,
  learnerOnboardingDoneKeyFor,
  removeFlag,
} from "./flags";

export async function wipeLocalState(userId: string | null): Promise<void> {
  const db = await getLearnerDb();
  await Promise.all(LEARNER_TABLE_NAMES.map((name) => db[name].clear()));

  removeFlag(EXAM_CONTEXT_STORAGE_KEY);
  removeFlag(LEARNER_ONBOARDING_DONE_LEGACY_KEY);
  removeFlag(SERVER_ACK_QUEUE_KEY);
  if (userId) {
    removeFlag(learnerOnboardingDoneKeyFor(userId));
    removeFlag(learnerCoachOpenerSeenKeyFor(userId));
  }
  // NOT removed: LEARNER_LANG_STORAGE_KEY — language survives deletion.
  // NOT removed: LEARNER_ANALYTICS_OPT_OUT_KEY — a privacy preference must
  // fail closed; clearing it on account deletion would silently re-enable
  // tracking for whoever next uses this browser.
  // NOT removed: LEARNER_MIC_CHECK_PASSED_KEY — device-capability state,
  // same class as the language key, not account data.
}
