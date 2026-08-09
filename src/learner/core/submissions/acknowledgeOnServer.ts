/**
 * Tell the backend the learner viewed the result for a submission
 * (#319 · Bug 1).
 *
 * Ports `deutschfit-mobile/src/core/submissions/acknowledgeOnServer.ts`.
 * Without this round-trip, the learner boots into the same "résultat
 * disponible" state every cold start because `submissions-list-
 * unacknowledged` keeps returning the same row. The edge function
 * (`deutschfit-backend/supabase/functions/submissions-acknowledge`)
 * stamps `acknowledged_at` on the row via a SECURITY DEFINER RPC and
 * is idempotent — re-acking is harmless.
 *
 * Wire contract:
 *   - POST { submission_id: uuid, module: 'sprechen' | 'schreiben' }
 *   - 200 → { submission_id, acknowledged_at }
 *   - 404 → RLS hides row OR id is absent. Treated as success — both
 *     possibilities mean "nothing for us to retry" (the row is already
 *     gone or was never ours), and blocking the foreground drain on it
 *     would just burn battery.
 *   - Any other error status → rethrown as-is. Unlike mobile (which
 *     wraps `supabase.functions.invoke` and has to fish the server code
 *     out of the error's `context` via `readFunctionsErrorCode`), the
 *     web `invokeFn` already throws `ApiError` carrying the server
 *     `code` directly — no unwrapping dance needed.
 */
import { ApiError, invokeFn } from "@/learner/core/api/client";
import type { ReadinessModule } from "@/learner/core/readiness";

export interface AcknowledgeOnServerArgs {
  readonly submissionId: string;
  readonly module: ReadinessModule;
}

export async function acknowledgeOnServer(args: AcknowledgeOnServerArgs): Promise<void> {
  try {
    await invokeFn("submissions-acknowledge", {
      method: "POST",
      body: { submission_id: args.submissionId, module: args.module },
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      // Idempotent server contract — already gone / not our row. Resolve.
      return;
    }
    throw err;
  }
}
