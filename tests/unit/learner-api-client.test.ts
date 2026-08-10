/**
 * Learner edge-function API client.
 *
 * Ports the semantics of `deutschfit-mobile`'s
 * `__wrapInvokeWith401Retry` (`src/core/api/supabase.ts`) to a plain
 * `fetch`-based client so the web learner app can call
 * `GET /functions/v1/<name>?...` uniformly (supabase-js's
 * `functions.invoke` cannot do GET + query params + custom headers
 * together).
 *
 * `getBrowserClient` is mocked so tests control `auth.getSession` /
 * `auth.refreshSession` / `auth.signOut` without a real Supabase project.
 * `global.fetch` is mocked so tests control the HTTP response sequence.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
const refreshSession = vi.fn();
const signOut = vi.fn();

vi.mock("@/lib/supabase/browser", () => ({
  getBrowserClient: () => ({
    auth: {
      getSession,
      refreshSession,
      signOut,
    },
  }),
}));

import { ApiError, invokeFn, rawGet, newIdempotencyKey } from "../../src/learner/core/api/client";

function jsonResponse(status: number, body: unknown, statusText = ""): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: { "content-type": "application/json" },
  });
}

describe("learner API client", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key-123";
    getSession.mockReset();
    refreshSession.mockReset();
    signOut.mockReset();
    // Mirrors real supabase-js: `getSession()` reflects whatever
    // `refreshSession()` last stored on the client instance.
    getSession.mockResolvedValue({ data: { session: { access_token: "token-1" } }, error: null });
    refreshSession.mockImplementation(async () => {
      getSession.mockResolvedValue({ data: { session: { access_token: "token-2" } }, error: null });
      return { data: { session: { access_token: "token-2" } }, error: null };
    });
    signOut.mockResolvedValue({ error: null });
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  it("retries exactly once after a 401 and succeeds", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { error: "unauthorized" }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const result = await invokeFn<{ ok: boolean }>("submissions-get");

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(signOut).not.toHaveBeenCalled();

    // Retry must use the refreshed token, not the stale one.
    const retryCall = fetchMock.mock.calls[1] as [string, RequestInit];
    const retryHeaders = new Headers(retryCall[1].headers);
    expect(retryHeaders.get("Authorization")).toBe("Bearer token-2");
  });

  it("signs out and throws session_expired when the retry also 401s", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { error: "unauthorized" }))
      .mockResolvedValueOnce(jsonResponse(401, { error: "unauthorized" }));

    await expect(invokeFn("submissions-get")).rejects.toMatchObject({
      code: "session_expired",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledTimes(1);
    // Local scope only — must not revoke the user's other sessions
    // (e.g. mobile), mirroring mobile's issue #332 rationale.
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("skips the retry and signs out (local scope) when refreshSession resolves { error }", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: "unauthorized" }));
    // supabase-js resolves `{ error }` for an expired/invalid refresh
    // token — it does not throw. The client must treat this the same
    // as a thrown error: no retry fetch, straight to local sign-out.
    refreshSession.mockResolvedValueOnce({
      data: { session: null },
      error: { message: "Invalid Refresh Token", status: 401 },
    });

    await expect(invokeFn("submissions-get")).rejects.toMatchObject({
      code: "session_expired",
      status: 401,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("throws ApiError instances (with status) for the session_expired case", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { error: "unauthorized" }))
      .mockResolvedValueOnce(jsonResponse(401, { error: "unauthorized" }));

    let caught: unknown;
    try {
      await invokeFn("submissions-get");
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).status).toBe(401);
  });

  it("sets the Idempotency-Key header when idempotencyKey is passed", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    await invokeFn("submissions-post", {
      method: "POST",
      body: { foo: "bar" },
      idempotencyKey: "11111111-1111-1111-1111-111111111111",
    });

    const call = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(call[1].headers);
    expect(headers.get("Idempotency-Key")).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("rawGet serializes params into the query string", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { items: [] }));

    await rawGet("topics-list", { board: "telc", level: "B1" });

    const call = fetchMock.mock.calls[0] as [string, RequestInit];
    const url = new URL(call[0]);
    expect(url.pathname).toBe("/functions/v1/topics-list");
    expect(url.searchParams.get("board")).toBe("telc");
    expect(url.searchParams.get("level")).toBe("B1");
    expect(call[1].method).toBe("GET");
  });

  it("maps a 409 in_flight body to ApiError code in_flight", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse(409, { error: "in_flight" }));

    await expect(invokeFn("submissions-post", { method: "POST" })).rejects.toMatchObject({
      status: 409,
      code: "in_flight",
    });
  });

  it("maps a 429 rate_limited body preserving the code and status", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse(429, { error: "rate_limited" }));

    await expect(invokeFn("submissions-post", { method: "POST" })).rejects.toMatchObject({
      status: 429,
      code: "rate_limited",
    });
  });

  it("returns parsed json typed on a 2xx response", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { hello: "world" }));

    const result = await invokeFn<{ hello: string }>("submissions-get");
    expect(result).toEqual({ hello: "world" });
  });

  it("resolves (not throws) on a 204 No Content — account-delete's actual response shape", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    // A real 204 carries no body at all — `new Response(null, { status: 204 })`
    // mirrors that exactly (not `jsonResponse`, which would still attach a
    // parseable JSON body and mask the bug this test exists to catch:
    // `res.json()` on an empty 204 body throws `SyntaxError: Unexpected
    // end of JSON input`, which every caller's `catch` sees as a request
    // failure even though the server succeeded).
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    const result = await invokeFn<void>("account-delete", { method: "POST" });
    expect(result).toBeUndefined();
  });

  it("resolves (not throws) on a 200 with an explicit content-length: 0", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(null, { status: 200, headers: { "content-length": "0" } })
    );

    await expect(invokeFn("submissions-post", { method: "POST" })).resolves.toBeUndefined();
  });

  it("carries the parsed error body through as ApiError.bodyJson (S4 — mock-exam 409)", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      jsonResponse(409, { error: "mock_in_progress", mock_attempt_id: "m1", status: "in_progress" })
    );

    await expect(invokeFn("mock-exam-start", { method: "POST" })).rejects.toMatchObject({
      status: 409,
      code: "mock_in_progress",
      bodyJson: { error: "mock_in_progress", mock_attempt_id: "m1", status: "in_progress" },
    });
  });

  it("falls back to statusText when the error body isn't valid JSON", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response("not json", { status: 500, statusText: "Internal Server Error" })
    );

    await expect(invokeFn("submissions-get")).rejects.toMatchObject({
      status: 500,
      code: "Internal Server Error",
    });
  });

  it("newIdempotencyKey returns a UUID-shaped string", () => {
    const key = newIdempotencyKey();
    expect(key).toMatch(/^[0-9a-f-]{36}$/i);
  });
});
