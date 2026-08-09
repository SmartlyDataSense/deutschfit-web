/**
 * Edge-function API client for the learner web app.
 *
 * Ports the semantics of `deutschfit-mobile`'s
 * `__wrapInvokeWith401Retry` (`src/core/api/supabase.ts`) to a plain
 * `fetch`-based client instead of wrapping `supabase.functions.invoke`.
 * The learner app needs GET requests with query params and uniform
 * custom headers (`Idempotency-Key`), which `functions.invoke` cannot
 * do — so this client talks to `${SUPABASE_URL}/functions/v1/<name>`
 * directly and reuses `getBrowserClient()` only for `auth.*`.
 *
 * Retry contract (single budget, mirrors mobile):
 *   - On a 401, call `auth.refreshSession()` once, then retry the same
 *     request once with a freshly-read access token.
 *   - If `refreshSession()` throws, or the retry also 401s, the session
 *     is unrecoverable: call `auth.signOut()` and throw
 *     `ApiError(401, "session_expired")`.
 *   - Any other status is mapped straight to `ApiError` (see
 *     `parseErrorBody` / `toApiError`) — no retry.
 */
import { getBrowserClient } from "@/lib/supabase/browser";

const FUNCTIONS_PATH = "/functions/v1/";
const CLIENT_INFO = "deutschfit-web-learner/0.1";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail?: string;
  /** Full parsed JSON error body, when the response had one (S4 — mock-exam 409 carries mock_attempt_id/status). */
  readonly bodyJson?: unknown;

  constructor(status: number, code: string, detail?: string, bodyJson?: unknown) {
    super(detail ?? code);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.detail = detail;
    this.bodyJson = bodyJson;
  }
}

type SupabasePublicEnvVar = "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY";

/**
 * Next.js/webpack inlines `NEXT_PUBLIC_*` vars into the client bundle via a
 * static textual replacement of `process.env.NEXT_PUBLIC_X` — it cannot see
 * through computed/bracket access like `process.env[name]`. Reading through
 * a dynamic key silently resolves to `undefined` in production (the
 * `process.env` object shipped to the browser only carries the literal keys
 * that were textually referenced elsewhere in the bundle), even though the
 * exact same var reads correctly wherever it's accessed with dot notation
 * (e.g. `src/lib/supabase/browser.ts`). Both branches below must stay
 * spelled out with the literal dotted form so the build can find them.
 */
function requiredEnv(name: SupabasePublicEnvVar): string {
  const value =
    name === "NEXT_PUBLIC_SUPABASE_URL"
      ? process.env.NEXT_PUBLIC_SUPABASE_URL
      : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!value) {
    throw new Error(`Supabase env vars missing: ${name} is required.`);
  }
  return value;
}

function functionUrl(fnPath: string): string {
  const base = requiredEnv("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
  return `${base}${FUNCTIONS_PATH}${fnPath}`;
}

/** Reads the current session's access token, falling back to the anon key when signed out. */
async function buildHeaders(idempotencyKey?: string): Promise<Headers> {
  const anonKey = requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const supabase = getBrowserClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? anonKey;

  const headers = new Headers({
    Authorization: `Bearer ${token}`,
    apikey: anonKey,
    "x-client-info": CLIENT_INFO,
  });
  if (idempotencyKey) {
    headers.set("Idempotency-Key", idempotencyKey);
  }
  return headers;
}

/** Best-effort JSON body parse — non-JSON / empty bodies fall back to `undefined`. */
async function parseErrorBody(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}

async function toApiError(res: Response): Promise<ApiError> {
  const bodyJson = await parseErrorBody(res);
  const body =
    bodyJson !== null && typeof bodyJson === "object"
      ? (bodyJson as { error?: string; detail?: string })
      : {};
  const code = body.error ?? res.statusText ?? "unknown_error";
  return new ApiError(res.status, code, body.detail, bodyJson);
}

type Method = "GET" | "POST";

interface RequestOptions {
  method: Method;
  body?: unknown;
  idempotencyKey?: string;
}

async function performFetch(url: string, opts: RequestOptions): Promise<Response> {
  const headers = await buildHeaders(opts.idempotencyKey);
  const init: RequestInit = { method: opts.method, headers };
  if (opts.body !== undefined) {
    headers.set("Content-Type", "application/json");
    init.body = JSON.stringify(opts.body);
  }
  return fetch(url, init);
}

/**
 * Core request path shared by `invokeFn` and `rawGet`: single-budget
 * 401 → refresh → retry-once → signOut-on-repeat-401.
 */
async function request<T>(url: string, opts: RequestOptions): Promise<T> {
  let res = await performFetch(url, opts);

  if (res.status === 401) {
    const supabase = getBrowserClient();
    // `refreshSession()` normally *resolves* `{ error }` for an expired/
    // invalid refresh token rather than throwing — but a hard network
    // failure can still reject the promise, so both shapes are treated
    // as "refresh failed" and short-circuit straight to sign-out without
    // spending the retry on a request that's guaranteed to 401 again.
    let refreshFailed = false;
    try {
      const { error } = await supabase.auth.refreshSession();
      refreshFailed = error !== null;
    } catch {
      refreshFailed = true;
    }
    if (refreshFailed) {
      // Local scope only: revoking just this device's session, not the
      // user's other sessions (e.g. the mobile app) — mirrors mobile's
      // `{ scope: "local" }` rationale (issue #332).
      await supabase.auth.signOut({ scope: "local" });
      throw new ApiError(401, "session_expired");
    }

    res = await performFetch(url, opts);
    if (res.status === 401) {
      await supabase.auth.signOut({ scope: "local" });
      throw new ApiError(401, "session_expired");
    }
  }

  if (!res.ok) {
    throw await toApiError(res);
  }

  return (await res.json()) as T;
}

/**
 * Calls edge function `name` at `/functions/v1/<name>`. Defaults to
 * POST (matching Supabase's `functions.invoke` default) since most
 * learner mutations are POST; pass `method: "GET"` for read-only
 * functions that take no query params (use `rawGet` when they do).
 */
export function invokeFn<T>(
  name: string,
  opts?: { method?: Method; body?: unknown; idempotencyKey?: string }
): Promise<T> {
  return request<T>(functionUrl(name), {
    method: opts?.method ?? "POST",
    body: opts?.body,
    idempotencyKey: opts?.idempotencyKey,
  });
}

/**
 * GET `/functions/v1/<fnPath>` with `params` serialized as a query
 * string. For read-only functions like `submissions-get`,
 * `topics-list`, `modelltests-list`, `audio-url`.
 */
export function rawGet<T>(fnPath: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(functionUrl(fnPath));
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }
  return request<T>(url.toString(), { method: "GET" });
}

/** Fresh `Idempotency-Key` for a mutating call (e.g. submission POSTs that must not double-fire). */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
