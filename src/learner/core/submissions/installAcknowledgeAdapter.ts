/**
 * Wire `acknowledgeReadiness` to the server-side `submissions-acknowledge`
 * round-trip with a localStorage retry queue.
 *
 * Ports `deutschfit-mobile/src/core/submissions/installAcknowledgeAdapter.ts`.
 * Deltas from mobile:
 *   - `AsyncStorage` (async) → the sync `getFlag`/`setFlag` localStorage
 *     helpers from `@/learner/core/storage/flags` (same queue-entry
 *     validation filter, just synchronous reads/writes).
 *   - `AppState` `background → active` → `document.visibilitychange`
 *     (`hidden → visible`) **and** the browser `online` event — the web
 *     tab can regain network without regaining visibility (e.g. Wi-Fi
 *     reconnects while the tab stays focused), so both trigger a drain.
 *   - The mobile `[319-trace]` debug logs are dropped — that trace was
 *     temporary instrumentation for mobile's #319 investigation and was
 *     never meant to ship long-term.
 *
 * Why an adapter (and not a direct call inside `acknowledgeReadiness`):
 *
 *   1. The pure readiness store has no transport / storage deps. Tests
 *      for the store don't need to mock the API client or localStorage.
 *   2. The hook registration is the same opt-in seam as
 *      `installPollingAdapter` — a single place in `LearnerProviders`
 *      to wire (or unwire) the side-effect.
 *   3. Failures need a queue. The learner can ack a result while
 *      offline; we must persist the intent and replay on the next
 *      foreground / online transition.
 *
 * Behaviour:
 *
 *   - On `acknowledgeReadiness({ submissionId, module, ... })`, fire
 *     `acknowledgeOnServer({ submissionId, module })` fire-and-forget.
 *     On rejection, append `{ submissionId, module }` to the queue at
 *     `SERVER_ACK_QUEUE_KEY`.
 *   - On the tab becoming visible, or the browser regaining
 *     connectivity, drain the queue: succeeded items drop out, failures
 *     stay for the next drain.
 *   - `uninstall()` removes the readiness hook and both listeners.
 *
 * The 404 idempotent-success path is handled inside `acknowledgeOnServer`
 * so it never enters the queue.
 */
import { registerAcknowledgeHook, type ReadinessModule } from "@/learner/core/readiness";
import { getFlag, setFlag, SERVER_ACK_QUEUE_KEY } from "@/learner/core/storage/flags";

import { acknowledgeOnServer } from "./acknowledgeOnServer";

type QueuedAck = {
  readonly submissionId: string;
  readonly module: ReadinessModule;
};

function isQueuedAck(item: unknown): item is QueuedAck {
  return (
    !!item &&
    typeof item === "object" &&
    typeof (item as QueuedAck).submissionId === "string" &&
    ((item as QueuedAck).module === "sprechen" || (item as QueuedAck).module === "schreiben")
  );
}

function readQueue(): QueuedAck[] {
  const raw = getFlag(SERVER_ACK_QUEUE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isQueuedAck);
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedAck[]): void {
  setFlag(SERVER_ACK_QUEUE_KEY, JSON.stringify(queue));
}

function enqueue(item: QueuedAck): void {
  const queue = readQueue();
  queue.push(item);
  writeQueue(queue);
}

async function drainQueue(): Promise<void> {
  const queue = readQueue();
  if (queue.length === 0) return;
  const remaining: QueuedAck[] = [];
  for (const item of queue) {
    try {
      await acknowledgeOnServer(item);
    } catch {
      remaining.push(item);
    }
  }
  writeQueue(remaining);
}

export function installAcknowledgeAdapter(): () => void {
  const unregister = registerAcknowledgeHook((payload) => {
    void (async () => {
      try {
        await acknowledgeOnServer({
          submissionId: payload.submissionId,
          module: payload.module,
        });
      } catch {
        enqueue({
          submissionId: payload.submissionId,
          module: payload.module,
        });
      }
    })();
  });

  const onVisibilityChange = (): void => {
    if (document.visibilityState !== "visible") return;
    void drainQueue();
  };
  const onOnline = (): void => {
    void drainQueue();
  };

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibilityChange);
  }
  if (typeof window !== "undefined") {
    window.addEventListener("online", onOnline);
  }

  return () => {
    unregister();
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("online", onOnline);
    }
  };
}
