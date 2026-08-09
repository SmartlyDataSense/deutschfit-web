/**
 * Readiness state-machine store — single-slot per learner
 * (async-result-experience DAG · Wave 0 · M-STATE).
 *
 * Ports `deutschfit-mobile/src/core/readiness/readinessStore.ts`. The
 * state machine, hook registries, notify try/catch, and idempotence
 * guards are verbatim; only the persistence layer and the default user-id
 * resolver differ, to match the web repo's IndexedDB (Dexie) stack
 * instead of mobile's Drizzle / `expo-sqlite`:
 *
 *   - Drizzle `INSERT … ON CONFLICT DO UPDATE` / `DELETE` → Dexie
 *     `activeSubmission.put(...)` / `.delete(...)`, run inside a
 *     fire-and-forget async IIFE (`getLearnerDb()` is itself async) —
 *     producers never await persistence, same best-effort contract as
 *     mobile.
 *   - `useAuth` (mobile) → `useLearnerSession` (web) in the default
 *     `resolveUserId`.
 *   - Persisted row fields are `snake_case` to match the S0 Dexie index
 *     spec (`activeSubmission: { primaryKey: ["user_id"] }`,
 *     `src/learner/core/db/schema.ts`) — mobile's Drizzle columns are
 *     `camelCase` because Drizzle maps them; Dexie stores whatever shape
 *     is `put`.
 *
 * Replaces the legacy `correctionUnseen` boolean flag with a proper
 * 3-state machine — `in-flight` → `ready` | `failed` → acknowledged
 * (slot cleared) — and persists the live row to `activeSubmission` so
 * the post-session pulse and the single-slot guard survive a page
 * reload.
 *
 * Producers (Sprechen / Schreiben submit flows, push receiver, poll
 * worker, reaper-failed receiver) call:
 *   - `markSubmissionInFlight(submissionId, module)` — submit succeeded;
 *     poll or push will land the result.
 *   - `markCorrectionLong(submissionId)` — 90s tick — flips `slow=true`.
 *     UI surfaces a "still working" hint without clearing the slot.
 *   - `markCorrectionReady(submissionId)` — graded payload landed.
 *   - `markSubmissionFailed(submissionId, reason)` — grader gave up,
 *     reaper timed out, or push retries exhausted on a network error.
 *
 * Consumers (Accueil Hero, FeedbackScreens) read via:
 *   - `getReadiness()` — synchronous current slot or `null`.
 *   - `subscribeReadiness(listener)` — fires on every transition.
 *
 * Lifecycle terminator:
 *   - `acknowledgeReadiness({ submissionId, module, acknowledgedAt })`
 *     — feedback screen calls this when the learner opens the result.
 *     Clears the slot so the next submit is allowed by the guard.
 *   - `clearReadiness()` — destructive escape-hatch (sign-out,
 *     account-delete). Drops the in-memory slot and the persisted row.
 *
 * Persistence model — `activeSubmission` (PK `user_id`, see
 * `src/learner/core/db/schema.ts`). Writes are best-effort
 * upserts (Dexie `.put`); reads are skipped when no user is resolved
 * (anonymous boot, sign-out window) so tests and the pre-auth onboarding
 * flow never touch the DB. A future hydrate-on-boot task consumes the
 * persisted row via `__hydrateForBoot(...)`.
 *
 * Single-slot rationale: a learner can have at most one in-flight
 * submission. Stacking a second submit is what the
 * `isSubmissionAllowed()` guard in `./guards.ts` blocks; this store
 * is the source of truth that guard reads.
 */
import { getLearnerDb } from "@/learner/core/db";
import { useLearnerSession } from "@/learner/core/auth/useLearnerSession";

import type {
  AcknowledgePayload,
  ReadinessFailedReason,
  ReadinessModule,
  ReadinessSignal,
} from "./types";

export type {
  AcknowledgePayload,
  ReadinessFailedReason,
  ReadinessModule,
  ReadinessSignal,
} from "./types";

type Listener = (signal: ReadinessSignal | null) => void;

/**
 * Side-effect hook fired when the slot transitions to `ready`. A future
 * cache layer can register a purger here so a cached submission blob is
 * cleared regardless of submissionId. Kept as an opt-in registration
 * (rather than a hard import) so tests for the pure store don't need to
 * mock storage, and the cache layer doesn't take a circular dep on the
 * store.
 */
type ReadyHook = (signal: ReadinessSignal) => void;
const readyHooks = new Set<ReadyHook>();

/**
 * Side-effect hook fired when the slot is acknowledged (learner opened
 * the result screen). A server-side ack adapter can register here so the
 * backend learns the row was viewed and stops resurrecting it via
 * `submissions-list-unacknowledged` on cold start. Same opt-in pattern
 * as `readyHooks` so the pure store has no transport / storage
 * dependencies.
 */
type AcknowledgeHook = (payload: AcknowledgePayload) => void;
const acknowledgeHooks = new Set<AcknowledgeHook>();

let active: ReadinessSignal | null = null;
const listeners = new Set<Listener>();

/**
 * Resolves the current learner id for persistence keying. The auth
 * store is the source of truth; the resolver is injectable so tests
 * (and future deep-link receivers) can pin a deterministic id without
 * mounting the auth provider.
 *
 * Returns `null` for the anonymous boot window, in which case
 * persistence is skipped (the in-memory slot still works — the row
 * just doesn't survive a restart). A future hydrate-on-boot task
 * re-reads the row on the next boot when an authenticated session is
 * back.
 */
type UserIdResolver = () => string | null;

let resolveUserId: UserIdResolver = () => {
  const session = useLearnerSession.getState().session;
  return session?.user.id ?? null;
};

function notify(): void {
  for (const fn of listeners) {
    try {
      fn(active);
    } catch {
      /* swallow — a buggy subscriber must not block the others */
    }
  }
}

function persist(signal: ReadinessSignal): void {
  const userId = resolveUserId();
  if (!userId) return;
  void (async () => {
    const db = await getLearnerDb();
    await db.activeSubmission.put({
      user_id: userId,
      submission_id: signal.submissionId,
      module: signal.module,
      state: signal.state,
      slow: signal.slow ? 1 : 0,
      failed_reason: signal.failedReason ?? null,
      started_at: signal.startedAt,
      acknowledged_at: signal.acknowledgedAt ?? null,
    });
  })().catch(() => {
    /* persistence is best-effort — in-memory slot is the source of truth */
  });
}

function persistDelete(): void {
  const userId = resolveUserId();
  if (!userId) return;
  void (async () => {
    const db = await getLearnerDb();
    await db.activeSubmission.delete(userId);
  })().catch(() => {
    /* best-effort */
  });
}

export function getReadiness(): ReadinessSignal | null {
  return active;
}

export function subscribeReadiness(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Mark a freshly-submitted item as in-flight. Re-emitting the same
 * `(submissionId, module)` while already `in-flight` is a no-op so
 * the ResultRouter's idempotent submit retry doesn't spuriously
 * re-notify subscribers. A different submission id replaces the slot
 * (newest wins) — this is normal when the previous slot was already
 * in a terminal state (`ready` / `failed`) and the user kicked off a
 * second submit; the single-slot guard
 * (`isSubmissionAllowed()` in `./guards.ts`) is what prevents a
 * second submit while the slot is still `in-flight`.
 */
export function markSubmissionInFlight(submissionId: string, module: ReadinessModule): void {
  if (
    active &&
    active.submissionId === submissionId &&
    active.module === module &&
    active.state === "in-flight"
  ) {
    return;
  }
  active = {
    submissionId,
    module,
    state: "in-flight",
    startedAt: Date.now(),
  };
  persist(active);
  notify();
}

/**
 * Flip the active in-flight slot's `slow` flag. Called after 90s
 * without a terminal callback so the UI can surface a "ça prend
 * un peu plus de temps que prévu" hint without changing state.
 *
 * No-ops when the slot doesn't match (slot empty / acknowledged / a
 * different submission). Idempotent — re-emitting once `slow` is true
 * doesn't notify subscribers.
 */
export function markCorrectionLong(submissionId: string): void {
  if (!active) return;
  if (active.submissionId !== submissionId) return;
  if (active.state !== "in-flight") return;
  if (active.slow === true) return;
  active = { ...active, slow: true };
  persist(active);
  notify();
}

/**
 * Move the slot to `ready` once the graded payload has landed (push
 * deep-link, poll success, or hydrated boot finding a server-side
 * `graded_at`). Re-emitting an already-ready submission is a no-op.
 *
 * Ignored when the submission id doesn't match the live slot — the
 * caller is reacting to a stale push and the predicate
 * `isStaleSubmission` should have filtered it before us; defensive
 * belt-and-suspenders guard here too.
 */
export function markCorrectionReady(submissionId: string): void {
  if (!active) return;
  if (active.submissionId !== submissionId) return;
  if (active.state === "ready") return;
  active = { ...active, state: "ready", slow: undefined };
  persist(active);
  for (const hook of readyHooks) {
    try {
      hook(active);
    } catch {
      /* a buggy hook must not block subscribers */
    }
  }
  notify();
}

/**
 * Register a side-effect to fire after every `markCorrectionReady`
 * transition. Returns an unregistration function. Used by a future
 * cache layer to purge the staged-submission blob regardless of
 * submissionId.
 *
 * Idempotent: re-registering the same callback installs it once
 * (Set semantics).
 */
export function registerReadyHook(hook: ReadyHook): () => void {
  readyHooks.add(hook);
  return () => {
    readyHooks.delete(hook);
  };
}

/**
 * Move the slot to `failed`. Triggered by the reaper push, the poll
 * worker giving up after the timeout budget, or a network-exhausted
 * push retry. Re-emitting an already-failed submission with the same
 * reason is a no-op.
 */
export function markSubmissionFailed(submissionId: string, reason: ReadinessFailedReason): void {
  if (!active) return;
  if (active.submissionId !== submissionId) return;
  if (active.state === "failed" && active.failedReason === reason) return;
  active = {
    ...active,
    state: "failed",
    failedReason: reason,
    slow: undefined,
  };
  persist(active);
  notify();
}

/**
 * Acknowledge — learner opened the result screen. Drops the slot so
 * the single-slot guard allows the next submit. Stamps
 * `acknowledgedAt` for analytics / hydration deduplication before the
 * slot is cleared (only the persisted row uses the timestamp; the
 * in-memory slot transitions straight to `null`).
 *
 * Mismatched payloads (slot empty, different submission id, different
 * module) are no-ops — feedback screens may double-fire on remount.
 */
export function acknowledgeReadiness(payload: AcknowledgePayload): void {
  if (!active) return;
  if (active.submissionId !== payload.submissionId) return;
  if (active.module !== payload.module) return;
  // Persist the ack timestamp so a future hydrate-on-boot task can
  // short-circuit a stale slot if needed, then clear in-memory.
  persist({ ...active, acknowledgedAt: payload.acknowledgedAt });
  active = null;
  persistDelete();
  for (const hook of acknowledgeHooks) {
    try {
      hook(payload);
    } catch {
      /* a buggy hook must not block subscribers or other hooks */
    }
  }
  notify();
}

/**
 * Register a side-effect to fire after every `acknowledgeReadiness`
 * transition that actually clears the slot. Returns an unregistration
 * function. A future server-side acknowledge adapter wires through
 * here.
 *
 * Idempotent: re-registering the same callback installs it once
 * (Set semantics).
 */
export function registerAcknowledgeHook(hook: AcknowledgeHook): () => void {
  acknowledgeHooks.add(hook);
  return () => {
    acknowledgeHooks.delete(hook);
  };
}

/**
 * Destructive clear — drops the slot regardless of state and removes
 * the persisted row. Used by sign-out / account-delete flows; feature
 * code should prefer `acknowledgeReadiness(...)`.
 */
export function clearReadiness(): void {
  if (active === null) {
    // Still try to clean up a stale persisted row (sign-out path).
    persistDelete();
    return;
  }
  active = null;
  persistDelete();
  notify();
}

/**
 * Boot-time hydration seam — a future hydrate-on-boot task reads
 * `activeSubmission` for the signed-in user and calls this with the
 * stored row so the in-memory slot is restored before any feature
 * code reads from the store. No notify on hydration — the boot path
 * has no subscribers yet, and we don't want to flash subscribers as
 * they mount.
 *
 * Pass `null` to clear the slot during hydration (e.g. the row exists
 * but is older than the staleness window — the predicate filter
 * decides; the hydrate task owns the policy).
 */
export function __hydrateForBoot(signal: ReadinessSignal | null): void {
  active = signal;
}

/** Test-only: reset module state between tests. */
export function __resetReadinessForTest(): void {
  active = null;
  listeners.clear();
  readyHooks.clear();
  acknowledgeHooks.clear();
  resolveUserId = () => {
    const session = useLearnerSession.getState().session;
    return session?.user.id ?? null;
  };
}

/**
 * Test-only: inject a deterministic user-id resolver. Tests use this
 * instead of mounting the auth provider; pass `() => null` to
 * exercise the anonymous-boot persistence-skip branch.
 */
export function __setUserIdResolverForTest(resolver: UserIdResolver): void {
  resolveUserId = resolver;
}
