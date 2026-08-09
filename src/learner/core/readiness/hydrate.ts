/**
 * Readiness slot hydration — boot + foreground replay.
 *
 * Ports `deutschfit-mobile/src/core/readiness/hydrate.ts` to the web
 * learner app. The readiness store (`./readinessStore.ts`) is the
 * in-memory source of truth that drives the Accueil StatusStrip and the
 * single-slot guard on submit. Task 3.1 made the slot survive a reload
 * by mirroring it into the local Dexie table `activeSubmission`. This
 * task makes the slot survive every path the browser might lose state
 * through:
 *
 *   - **Cold load / tab close mid-submit** — the local Dexie row replays
 *     the in-flight slot before Accueil renders.
 *   - **Cross-device handoff** — Marie submits on her phone, then opens
 *     the web app before push has reached it (the web app has no push
 *     yet); the tab queries the `submissions-list-unacknowledged` edge
 *     fn and seeds its own slot.
 *   - **Foreground replay** — the tab regains visibility after the
 *     remote may have flipped the row to `graded`; we re-fetch and
 *     transition the local slot to `ready` so polling stops and the
 *     strip flips without waiting for a push.
 *
 * Two entry points:
 *
 *   - `hydrateOnBoot()` — called once from `LearnerProviders` right
 *     after the learner authenticates. Reads local Dexie AND fans out
 *     one fetch to `submissions-list-unacknowledged`. Server rows that
 *     exist locally are deduped by `submissionId`; server-only rows
 *     (e.g. submitted on another device) cause a `markSubmissionInFlight`
 *     so the StatusStrip surfaces. If the server says a row is `graded`
 *     while local says `in-flight`, immediately `markCorrectionReady`.
 *   - `hydrateOnForeground()` — bound to `document.visibilitychange`
 *     (`hidden → visible`) by `subscribeForegroundHydration()`. Same
 *     logic, throttled to once per 30 s to avoid hammering the edge fn
 *     on rapid tab-switch flips.
 *
 * **Auth-staged**: never calls the edge fn before auth is resolved. If
 * the user is signed out, both entry points are no-ops.
 *
 * **Errors are silent**: hydration fails → log a `hydrate_failed`
 * analytics breadcrumb (`phase`, `reason`) and return. The user never
 * sees an error; polling + push paths cover the worst case.
 *
 * **Merge semantics** (verbatim from mobile — the policy is locally
 * owned because the plan left it under-specified):
 *   1. Union by `submissionId`.
 *   2. If both local and server have a row for the same submissionId:
 *      - Server `graded` + local `in-flight` → `markCorrectionReady`
 *        (server wins on the terminal transition).
 *      - Otherwise local wins (it carries `slow`, `failedReason`,
 *        the `acknowledged_at` ack timestamp the server can't see yet).
 *   3. Server-only rows (no local match) → `markSubmissionInFlight`
 *      with the server-reported state. If the server says `graded`,
 *      we still seed in-flight first then immediately
 *      `markCorrectionReady` — this is the only way the readiness
 *      store accepts a transition (you can't jump straight to ready
 *      with no `in-flight` history).
 *   4. The single-slot store is just that: one row max. If the server
 *      reports more than one unacknowledged row, we pick the most
 *      recent `created_at` so Marie sees her newest submission.
 *
 * Deltas from mobile (see task-3.3 brief):
 *   - Drizzle `readLocal` → `(await getLearnerDb()).activeSubmission.get(userId)`.
 *   - `supabase.functions.invoke` → `invokeFn(...)` behind an injectable
 *     `fetchUnacknowledged` seam (replaces mobile's `__setSupabaseForTest`).
 *   - `AppState` → `document.visibilitychange`.
 *   - The 30 s throttle is inlined locally (mobile's `createTimeThrottle`
 *     util is a 10-line pure gate — reproduced here rather than porting
 *     a whole `util/throttle.ts` module for one caller).
 */
import { getLearnerDb } from "@/learner/core/db";
import type { ActiveSubmissionRow } from "@/learner/core/db/types";
import { trackEvent } from "@/learner/core/analytics/posthog";
import { invokeFn } from "@/learner/core/api/client";

import {
  __hydrateForBoot,
  markCorrectionReady,
  markSubmissionInFlight,
  resolveActiveUserId,
} from "./readinessStore";
import type { ReadinessModule, ReadinessSignal } from "./types";

/**
 * Throttle window for `hydrateOnForeground`. The 30-second floor is a
 * guardrail; the boot path always runs (no throttle) because it fires
 * once per authenticated session.
 */
export const FOREGROUND_HYDRATE_THROTTLE_MS = 30_000;

/**
 * Edge-fn unacknowledged row shape. Mirrors the contract documented in
 * the mobile M-HYDRATE prompt: `{ id, status, created_at, graded_at }`.
 * `kind` is implied by the bucket the row appears in
 * (`{ sprechen, writing }`).
 */
export interface UnackRow {
  readonly id: string;
  readonly status: "pending" | "grading" | "graded" | "failed";
  readonly created_at: string;
  readonly graded_at?: string | null;
}

interface UnackResponse {
  readonly sprechen: readonly UnackRow[];
  readonly writing: readonly UnackRow[];
}

type ServerEntry = {
  readonly row: UnackRow;
  readonly module: ReadinessModule;
};

/** Test seam replacing the whole server-fetch step (see module docstring deltas). */
type FetchUnacknowledgedFn = () => Promise<UnackResponse>;

/**
 * Time-based throttle gate — inlined port of mobile's
 * `src/core/util/throttle.ts` (`createTimeThrottle`). Returns `true` at
 * most once per `intervalMs` window.
 */
function createTimeThrottle(intervalMs: number, now: () => number = Date.now) {
  let lastAcquiredAt: number | null = null;
  return {
    tryAcquire: (): boolean => {
      const t = now();
      if (lastAcquiredAt !== null && t - lastAcquiredAt < intervalMs) {
        return false;
      }
      lastAcquiredAt = t;
      return true;
    },
    reset: (): void => {
      lastAcquiredAt = null;
    },
  };
}

let foregroundThrottle = createTimeThrottle(FOREGROUND_HYDRATE_THROTTLE_MS);
let visibilityListener: (() => void) | null = null;
let injectedFetchUnacknowledged: FetchUnacknowledgedFn | null = null;

async function defaultFetchUnacknowledged(): Promise<UnackResponse> {
  return invokeFn<UnackResponse>("submissions-list-unacknowledged", { method: "GET" });
}

function fetchUnacknowledged(): Promise<UnackResponse> {
  return (injectedFetchUnacknowledged ?? defaultFetchUnacknowledged)();
}

function rowToSignal(row: ActiveSubmissionRow): ReadinessSignal | null {
  if (row.module !== "sprechen" && row.module !== "schreiben") return null;
  if (row.state !== "in-flight" && row.state !== "ready" && row.state !== "failed") {
    return null;
  }
  const failedReason = row.failed_reason;
  return {
    submissionId: row.submission_id,
    module: row.module,
    state: row.state,
    slow: row.slow === 1 ? true : undefined,
    failedReason:
      failedReason === "grader" || failedReason === "reaper-timeout" || failedReason === "network"
        ? failedReason
        : undefined,
    startedAt: row.started_at,
    acknowledgedAt: row.acknowledged_at ?? undefined,
  };
}

async function readLocal(userId: string): Promise<ReadinessSignal | null> {
  try {
    const db = await getLearnerDb();
    const row = (await db.activeSubmission.get(userId)) as ActiveSubmissionRow | undefined;
    if (!row) return null;
    // If the row is already acknowledged, treat it as cleared — the
    // ack-deletion is best-effort and may have lost on a crash.
    if (row.acknowledged_at !== null && row.acknowledged_at !== undefined) {
      return null;
    }
    return rowToSignal(row);
  } catch {
    return null;
  }
}

async function fetchServer(): Promise<UnackResponse> {
  const data = await fetchUnacknowledged();
  const sprechen = Array.isArray(data?.sprechen) ? data.sprechen : [];
  const writing = Array.isArray(data?.writing) ? data.writing : [];
  return { sprechen, writing };
}

/**
 * Pick at most one server-side entry to seed when local is empty. Newest
 * `created_at` wins so the device surfaces Marie's latest submission
 * if the server is somehow holding multiple unacknowledged rows.
 */
function pickNewestServerEntry(resp: UnackResponse): ServerEntry | null {
  const all: ServerEntry[] = [
    ...resp.sprechen.map<ServerEntry>((row) => ({ row, module: "sprechen" })),
    ...resp.writing.map<ServerEntry>((row) => ({ row, module: "schreiben" })),
  ];
  if (all.length === 0) return null;
  all.sort((a, b) => {
    const ta = Date.parse(a.row.created_at);
    const tb = Date.parse(b.row.created_at);
    return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta);
  });
  return all[0] ?? null;
}

function findMatchingServerEntry(resp: UnackResponse, submissionId: string): ServerEntry | null {
  const sp = resp.sprechen.find((r) => r.id === submissionId);
  if (sp) return { row: sp, module: "sprechen" };
  const wr = resp.writing.find((r) => r.id === submissionId);
  if (wr) return { row: wr, module: "schreiben" };
  return null;
}

function startedAtFromCreatedAt(createdAt: string): number {
  const t = Date.parse(createdAt);
  return Number.isNaN(t) ? Date.now() : t;
}

function applyMerge(local: ReadinessSignal | null, server: UnackResponse): void {
  if (local) {
    // Boot-time hydrate: install local first so the in-memory slot
    // matches the persisted row before any subscriber mounts. No
    // notify (boot has no subscribers yet — see `__hydrateForBoot`).
    __hydrateForBoot(local);

    // Server may have a terminal verdict the device never received
    // (push lost / offline when grader finished). Look up the matching
    // row and flip to ready if the server says so.
    const match = findMatchingServerEntry(server, local.submissionId);
    if (match && match.row.status === "graded" && local.state === "in-flight") {
      // markCorrectionReady notifies subscribers; it's intentional —
      // hydration that reveals a terminal state should wake the strip.
      markCorrectionReady(local.submissionId);
    }
    return;
  }

  // Local empty — server-only path (cross-device handoff, or local DB
  // cleared). Pick the newest server row and seed it.
  const entry = pickNewestServerEntry(server);
  if (!entry) return;

  // We can't directly install a `ready` slot via the public API
  // (`markCorrectionReady` requires an `in-flight` predecessor). So we
  // install the in-flight slot via `__hydrateForBoot` (no notify) then
  // call `markCorrectionReady` if the server says graded — the notify
  // on the ready transition is the wakeup the strip wants.
  const seed: ReadinessSignal = {
    submissionId: entry.row.id,
    module: entry.module,
    state: "in-flight",
    startedAt: startedAtFromCreatedAt(entry.row.created_at),
  };

  if (entry.row.status === "graded") {
    __hydrateForBoot(seed);
    markCorrectionReady(entry.row.id);
    return;
  }

  // Pending / grading / failed → seed via the public producer so the
  // single-slot guard sees the slot and subscribers (none yet at boot,
  // some on foreground) are notified.
  if (
    entry.row.status === "pending" ||
    entry.row.status === "grading" ||
    entry.row.status === "failed"
  ) {
    markSubmissionInFlight(entry.row.id, entry.module);
    // Note: we don't translate `failed` further. The poll worker will
    // land the failure with a precise reason; the in-flight slot in
    // the meantime keeps the strip honest ("on corrige…"). If the next
    // foreground tick still sees `failed`, the poller surfaces it.
  }
}

async function runHydrate(phase: "boot" | "foreground"): Promise<void> {
  // Auth-staged: skip when the learner is signed out. Shares the
  // readiness store's own `resolveUserId` (see `resolveActiveUserId`)
  // rather than reading `useLearnerSession` independently, so this gate
  // and the store's persistence agree on exactly one auth signal (and
  // one test seam — `__setUserIdResolverForTest`). The edge fn also
  // rejects without a bearer token, so this is defence in depth.
  const userId = resolveActiveUserId();
  if (!userId) {
    return;
  }

  let local: ReadinessSignal | null = null;
  try {
    local = await readLocal(userId);
  } catch {
    trackEvent("hydrate_failed", { phase, reason: "local_read" });
    // Don't return — the server fetch may still succeed.
  }

  let server: UnackResponse | null = null;
  try {
    server = await fetchServer();
  } catch (err) {
    const reason =
      err instanceof Error && err.message.length > 0 ? "server_fetch" : "server_fetch_unknown";
    trackEvent("hydrate_failed", { phase, reason });
    server = null;
  }

  if (server === null) {
    // Server fetch failed — install local (if any) so the strip still
    // works for the same-device cold-load case. Cross-device replay
    // will retry on the next foreground transition.
    if (local) {
      __hydrateForBoot(local);
    }
    return;
  }

  applyMerge(local, server);
}

/**
 * Boot-time hydration. Call once after the learner authenticates and
 * before the first render of any surface that subscribes to readiness
 * (Accueil / StatusStrip).
 *
 * Always runs (no throttle); a missed boot hydrate would leave the
 * strip blind for the rest of the session.
 */
export async function hydrateOnBoot(): Promise<void> {
  await runHydrate("boot");
}

/**
 * Foreground replay. Throttled to once per
 * `FOREGROUND_HYDRATE_THROTTLE_MS` (30 s) to keep rapid tab-hidden /
 * tab-visible flips from hammering the edge fn.
 */
export async function hydrateOnForeground(): Promise<void> {
  if (!foregroundThrottle.tryAcquire()) return;
  await runHydrate("foreground");
}

/**
 * `document.visibilitychange` subscriber. Calls `hydrateOnForeground()`
 * whenever the tab becomes visible again. Returns a teardown the caller
 * invokes on unmount.
 *
 * Idempotent — repeat calls reuse the same listener so a bad provider
 * remount doesn't leak listeners.
 */
export function subscribeForegroundHydration(): () => void {
  if (typeof document === "undefined") {
    return () => undefined;
  }
  if (visibilityListener !== null) {
    return () => {
      if (visibilityListener) {
        document.removeEventListener("visibilitychange", visibilityListener);
        visibilityListener = null;
      }
    };
  }
  visibilityListener = () => {
    if (document.visibilityState !== "visible") return;
    void hydrateOnForeground();
  };
  document.addEventListener("visibilitychange", visibilityListener);
  return () => {
    if (visibilityListener) {
      document.removeEventListener("visibilitychange", visibilityListener);
      visibilityListener = null;
    }
  };
}

/**
 * Test-only — reset the throttle gate so `hydrateOnForeground` runs on
 * the next call regardless of the previous window. Also drops any
 * `visibilitychange` listener installed by `subscribeForegroundHydration`
 * and clears the injected fetch seam.
 */
export function __resetHydrateForTest(): void {
  foregroundThrottle = createTimeThrottle(FOREGROUND_HYDRATE_THROTTLE_MS);
  if (visibilityListener && typeof document !== "undefined") {
    document.removeEventListener("visibilitychange", visibilityListener);
  }
  visibilityListener = null;
  injectedFetchUnacknowledged = null;
}

/**
 * Test-only — inject a fake `submissions-list-unacknowledged` fetch so
 * logic tests don't need the real `invokeFn`/network wiring. Pass
 * `null` to restore the real `invokeFn`-backed implementation.
 */
export function __setFetchUnacknowledgedForTest(fn: FetchUnacknowledgedFn | null): void {
  injectedFetchUnacknowledged = fn;
}

// Re-export so consumers that import `@/learner/core/readiness/hydrate`
// directly can read the merge semantics typing without round-tripping
// through the readiness barrel.
export { getReadiness } from "./readinessStore";
