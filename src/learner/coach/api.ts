/**
 * Coach chat transport client (S9 · Task 9.1).
 *
 * Ports `deutschfit-mobile/src/features/coach/api.ts` + the
 * thread/history helpers from `deutschfit-mobile/src/core/api/coach.ts`
 * (both at mobile HEAD `3cced7a`), swapping the transport from
 * `supabase.functions.invoke` (which returns `{data, error}`) to this
 * app's `invokeFn` (which throws `ApiError` on transport/HTTP failure).
 * The mapping tables (`codeForStatus`, `codeForBodyError`, `mapHistory`)
 * are byte-equivalent to mobile's.
 *
 * Edge-function contract (POST, JWT required):
 *   request  : {
 *     thread_id: string,
 *     message:   string,
 *     history:   [{ role: "user"|"assistant", text: string }],
 *     user:      { level: "A1"|…|"C2", board: "GOETHE"|"OESD"|"TELC" } // hint
 *   }
 *   response : { message_id, text, created_at }
 *
 * The backend reads the authoritative `exam_level` + `exam_board` from
 * `user_profiles` — the body `user` field is only a hint and is ignored
 * when the profile row is populated.
 *
 * Error vocabulary (`Error.message` carries a stable snake_case code):
 *   - `coach_empty_request`            — pre-flight: empty/whitespace text.
 *   - `coach_rate_limited`             — 429 from the edge (also surfaces
 *                                        the backend's `rate_limited` body).
 *   - `coach_unauthorized`             — 401 (JWT missing/expired).
 *   - `coach_forbidden`                — 403.
 *   - `coach_profile_incomplete`       — 400 `profile_missing_level_or_board`.
 *   - `coach_service_unavailable`      — 502/503/504 (Python service
 *                                        unreachable or errored).
 *   - `coach_server_error`             — 5xx otherwise.
 *   - `coach_transport_failed`         — network / parse error before we
 *                                        got a structured response.
 *   - `coach_empty_response`           — server returned 2xx with no body.
 *   - `coach_malformed_response`       — missing `text` / `message_id`.
 *   - `coach_threads_fetch_failed`     — `coach-threads` transport error.
 *   - `coach_history_fetch_failed`     — `coach-thread-history` transport error.
 *
 * No message bodies leak into logs. Every warn/log uses metadata only
 * (status, duration_ms, thread_id hash) — matches the backend's §5 rule.
 */
import { ApiError, invokeFn } from "@/learner/core/api";
import type {
  CoachMessage,
  CoachSendRequest,
  CoachSendResponse,
  CoachThreadSummary,
} from "./types";

const EDGE_FUNCTION_NAME = "ai-coach";

/**
 * Historical retention sent to the backend. The edge function forwards
 * the full list to the Python service; 20 turns is more than enough
 * context without blowing the JSON budget. Trim from the *head* (oldest
 * first) so the most recent turns survive.
 */
export const HISTORY_TAIL = 20;

export type SendCoachMessageOptions = {
  /** CEFR level hint forwarded to the edge function. Backend is authoritative. */
  levelHint?: string;
  /** Exam board hint ("GOETHE" | "OESD" | "TELC"). Backend is authoritative. */
  boardHint?: string;
};

interface EdgeRequestBody {
  thread_id: string;
  message: string;
  history: readonly { role: "user" | "assistant"; text: string }[];
  user?: { level?: string; board?: string };
}

interface EdgeResponseBody {
  message_id?: unknown;
  text?: unknown;
  created_at?: unknown;
  error?: unknown;
}

export function codeForStatus(status: number): string {
  if (status === 401) return "coach_unauthorized";
  if (status === 403) return "coach_forbidden";
  if (status === 429) return "coach_rate_limited";
  if (status === 502 || status === 503 || status === 504) {
    return "coach_service_unavailable";
  }
  if (status >= 500) return "coach_server_error";
  return "coach_transport_failed";
}

export function codeForBodyError(bodyError: string, status: number | null): string {
  // Normalise the structured edge responses into the stable client
  // vocabulary. The edge function emits `{error: "rate_limited"}` on 429,
  // `{error: "profile_missing_level_or_board"}` on 400, etc.
  switch (bodyError) {
    case "rate_limited":
      return "coach_rate_limited";
    case "profile_missing_level_or_board":
      return "coach_profile_incomplete";
    case "ai_service_unreachable":
    case "ai_service_failed":
    case "ai_service_timeout":
      return "coach_service_unavailable";
    case "invalid_json":
    case "missing_message":
    case "missing_thread_id":
      return "coach_transport_failed";
    default:
      return status !== null ? codeForStatus(status) : "coach_transport_failed";
  }
}

/**
 * Mirrors mobile's `mapHistory` exactly (`deutschfit-mobile/src/features/coach/api.ts`):
 * keep `user`/`assistant` turns with non-empty text. There is deliberately
 * NO `status` filter (error-status turns ARE sent) and NO `.trim()`
 * (whitespace-only text survives) — mobile has neither guard.
 */
function mapHistory(
  history: readonly CoachMessage[]
): readonly { role: "user" | "assistant"; text: string }[] {
  const mapped: { role: "user" | "assistant"; text: string }[] = [];
  for (const m of history) {
    if (m.role !== "user" && m.role !== "assistant") continue;
    if (typeof m.text !== "string" || m.text.length === 0) continue;
    mapped.push({ role: m.role, text: m.text });
  }
  // Keep the trailing window so the oldest turns fall off first.
  return mapped.length > HISTORY_TAIL ? mapped.slice(mapped.length - HISTORY_TAIL) : mapped;
}

function isString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

/**
 * Send a user message to the `ai-coach` edge function and resolve with
 * the assistant reply. Throws an `Error` whose `.message` carries a
 * stable `coach_*` code for the UI i18n dictionary.
 */
export async function sendCoachMessage(
  req: CoachSendRequest,
  options: SendCoachMessageOptions = {}
): Promise<CoachSendResponse> {
  if (typeof req.message !== "string" || req.message.trim().length === 0) {
    throw new Error("coach_empty_request");
  }
  if (typeof req.threadId !== "string" || req.threadId.trim().length === 0) {
    throw new Error("coach_empty_request");
  }

  const body: EdgeRequestBody = {
    thread_id: req.threadId,
    message: req.message.trim(),
    history: mapHistory(req.history),
  };

  // Only attach the hint object when the caller supplied something. The
  // backend treats the field as optional; sending `{}` just wastes bytes.
  const level = isString(options.levelHint) ? options.levelHint.toUpperCase() : undefined;
  const board = isString(options.boardHint) ? options.boardHint.toUpperCase() : undefined;
  if (level !== undefined || board !== undefined) {
    body.user = {};
    if (level !== undefined) body.user.level = level;
    if (board !== undefined) body.user.board = board;
  }

  let data: EdgeResponseBody | null = null;
  try {
    data = await invokeFn<EdgeResponseBody>(EDGE_FUNCTION_NAME, { method: "POST", body });
  } catch (err) {
    if (err instanceof ApiError) {
      throw new Error(codeForBodyError(err.code, err.status));
    }
    throw new Error("coach_transport_failed");
  }

  if (!data || typeof data !== "object") {
    throw new Error("coach_empty_response");
  }
  if (typeof data.error === "string") {
    // The edge function returned 2xx with a structured error envelope —
    // uncommon but possible for future soft-failure paths. Map the same
    // way we do for transport errors.
    throw new Error(codeForBodyError(data.error, 200));
  }
  if (!isString(data.message_id) || !isString(data.text)) {
    throw new Error("coach_malformed_response");
  }

  const createdAt = isString(data.created_at) ? data.created_at : new Date().toISOString();

  return {
    messageId: data.message_id,
    text: data.text,
    createdAt,
  };
}

/**
 * Internals exposed for unit tests — not part of the public surface.
 */
export const __coachApiInternals = {
  mapHistory,
  codeForStatus,
  codeForBodyError,
};

// ---------------------------------------------------------------------------
// Thread listing + history loading (coach-threads / coach-thread-history)
// ---------------------------------------------------------------------------

interface CoachThreadsResponseBody {
  threads?: unknown;
  error?: unknown;
}

interface CoachHistoryResponseBody {
  messages?: unknown;
  error?: unknown;
}

interface RawThreadItem {
  thread_id?: unknown;
  preview?: unknown;
  message_count?: unknown;
  started_at?: unknown;
  last_message_at?: unknown;
}

interface RawMessageItem {
  id?: unknown;
  role?: unknown;
  text?: unknown;
  created_at?: unknown;
}

function isRawThread(v: unknown): v is RawThreadItem {
  return typeof v === "object" && v !== null;
}

function isRawMessage(v: unknown): v is RawMessageItem {
  return typeof v === "object" && v !== null;
}

export async function listCoachThreads(): Promise<CoachThreadSummary[]> {
  let data: CoachThreadsResponseBody | null = null;
  try {
    data = await invokeFn<CoachThreadsResponseBody>("coach-threads", { method: "POST", body: {} });
  } catch {
    throw new Error("coach_threads_fetch_failed");
  }

  if (!data || !Array.isArray(data.threads)) {
    return [];
  }

  return data.threads
    .filter(isRawThread)
    .map((t) => ({
      threadId: typeof t.thread_id === "string" ? t.thread_id : "",
      preview: typeof t.preview === "string" ? t.preview : "",
      messageCount: typeof t.message_count === "number" ? t.message_count : 0,
      startedAt: typeof t.started_at === "string" ? t.started_at : "",
      lastMessageAt: typeof t.last_message_at === "string" ? t.last_message_at : "",
    }))
    .filter((t) => t.threadId.length > 0);
}

export async function loadCoachThreadHistory(threadId: string): Promise<CoachMessage[]> {
  if (!threadId.trim()) return [];

  let data: CoachHistoryResponseBody | null = null;
  try {
    data = await invokeFn<CoachHistoryResponseBody>("coach-thread-history", {
      method: "POST",
      body: { thread_id: threadId },
    });
  } catch {
    throw new Error("coach_history_fetch_failed");
  }

  if (!data || !Array.isArray(data.messages)) {
    return [];
  }

  return data.messages
    .filter(isRawMessage)
    .map((m) => ({
      id: typeof m.id === "string" ? m.id : `hist-${Math.random()}`,
      role:
        m.role === "user" || m.role === "assistant"
          ? (m.role as "user" | "assistant")
          : "assistant",
      text: typeof m.text === "string" ? m.text : "",
      createdAt: typeof m.created_at === "string" ? m.created_at : new Date().toISOString(),
      status: "complete" as const,
    }))
    .filter((m) => m.text.length > 0);
}
