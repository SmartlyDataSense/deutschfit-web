/**
 * Learner session store (`useLearnerSession`) + bootstrap lifecycle
 * (`bootstrapLearnerSession`).
 *
 * Ports `deutschfit-mobile`'s `src/core/auth/useAuth.ts` +
 * `src/core/auth/session.ts` semantics to the web learner app: same
 * `status: "loading" | "authenticated" | "unauthenticated"` contract, same
 * warm-start freshness gate (synchronous refresh when the cached session
 * expires within 60s), same `PASSWORD_RECOVERY` suppression, same
 * `signOut({ scope: "local" })` rationale (don't revoke the user's other
 * sessions, e.g. mobile).
 *
 * `getBrowserClient` is mocked so tests control `auth.getSession` /
 * `auth.refreshSession` / `auth.signOut` / `auth.onAuthStateChange`
 * without a real Supabase project — mirrors `learner-api-client.test.ts`.
 */
import type { Session } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
const refreshSession = vi.fn();
const signOut = vi.fn();
const onAuthStateChange = vi.fn();

vi.mock("@/lib/supabase/browser", () => ({
  getBrowserClient: () => ({
    auth: {
      getSession,
      refreshSession,
      signOut,
      onAuthStateChange,
    },
  }),
}));

import type * as LearnerSessionModule from "../../src/learner/core/auth/useLearnerSession";

type AuthChangeCallback = (event: string, session: Session | null) => void;

function fakeSession(overrides: Partial<Session> = {}): Session {
  return {
    access_token: "token-1",
    refresh_token: "refresh-1",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user: { id: "user-1" } as Session["user"],
    ...overrides,
  } as Session;
}

describe("useLearnerSession + bootstrapLearnerSession", () => {
  let authStateCallback: AuthChangeCallback | null = null;
  const unsubscribe = vi.fn();
  let bootstrapLearnerSession: typeof LearnerSessionModule.bootstrapLearnerSession;
  let useLearnerSession: typeof LearnerSessionModule.useLearnerSession;

  beforeEach(async () => {
    getSession.mockReset();
    refreshSession.mockReset();
    signOut.mockReset();
    onAuthStateChange.mockReset();
    unsubscribe.mockReset();
    authStateCallback = null;

    onAuthStateChange.mockImplementation((cb: AuthChangeCallback) => {
      authStateCallback = cb;
      return { data: { subscription: { unsubscribe } } };
    });
    signOut.mockResolvedValue({ error: null });

    // The module under test holds module-level singleton state (the
    // zustand store + the cached `onAuthStateChange` subscription used for
    // idempotent re-subscription). Reset the module registry so each test
    // gets a fresh, pristine instance instead of leaking a subscription
    // (and its `unsubscribe` call) across tests.
    vi.resetModules();
    const mod = await import("../../src/learner/core/auth/useLearnerSession");
    bootstrapLearnerSession = mod.bootstrapLearnerSession;
    useLearnerSession = mod.useLearnerSession;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("transitions loading -> authenticated when a fresh session is cached", async () => {
    const session = fakeSession();
    getSession.mockResolvedValue({ data: { session } });

    await bootstrapLearnerSession();

    expect(useLearnerSession.getState().status).toBe("authenticated");
    expect(useLearnerSession.getState().session).toEqual(session);
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it("transitions loading -> unauthenticated when there is no cached session", async () => {
    getSession.mockResolvedValue({ data: { session: null } });

    await bootstrapLearnerSession();

    expect(useLearnerSession.getState().status).toBe("unauthenticated");
    expect(useLearnerSession.getState().session).toBeNull();
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it("a SIGNED_OUT auth-state event flips an authenticated store to unauthenticated", async () => {
    const session = fakeSession();
    getSession.mockResolvedValue({ data: { session } });
    await bootstrapLearnerSession();
    expect(useLearnerSession.getState().status).toBe("authenticated");

    authStateCallback?.("SIGNED_OUT", null);

    expect(useLearnerSession.getState().status).toBe("unauthenticated");
    expect(useLearnerSession.getState().session).toBeNull();
  });

  it("ignores PASSWORD_RECOVERY events (mirrors mobile's session.ts guard)", async () => {
    const session = fakeSession();
    getSession.mockResolvedValue({ data: { session } });
    await bootstrapLearnerSession();

    authStateCallback?.("PASSWORD_RECOVERY", null);

    expect(useLearnerSession.getState().status).toBe("authenticated");
    expect(useLearnerSession.getState().session).toEqual(session);
  });

  it("warm-start: refreshes synchronously when the cached session expires within 60s", async () => {
    const staleSession = fakeSession({ expires_at: Math.floor(Date.now() / 1000) + 30 });
    const freshSession = fakeSession({
      access_token: "token-refreshed",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    });
    getSession.mockResolvedValue({ data: { session: staleSession } });
    refreshSession.mockResolvedValue({ data: { session: freshSession }, error: null });

    await bootstrapLearnerSession();

    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(useLearnerSession.getState().session).toEqual(freshSession);
    expect(useLearnerSession.getState().status).toBe("authenticated");
  });

  it("warm-start: does not refresh when the cached session has ample expiry", async () => {
    const session = fakeSession({ expires_at: Math.floor(Date.now() / 1000) + 3600 });
    getSession.mockResolvedValue({ data: { session } });

    await bootstrapLearnerSession();

    expect(refreshSession).not.toHaveBeenCalled();
    expect(useLearnerSession.getState().session).toEqual(session);
  });

  it("warm-start: publishes null and unauthenticated when the synchronous refresh throws", async () => {
    const staleSession = fakeSession({ expires_at: Math.floor(Date.now() / 1000) + 10 });
    getSession.mockResolvedValue({ data: { session: staleSession } });
    refreshSession.mockRejectedValue(new Error("network down"));

    await bootstrapLearnerSession();

    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(useLearnerSession.getState().status).toBe("unauthenticated");
    expect(useLearnerSession.getState().session).toBeNull();
  });

  it("is idempotent: a second bootstrap call tears down the previous subscription before re-subscribing", async () => {
    getSession.mockResolvedValue({ data: { session: null } });

    await bootstrapLearnerSession();
    await bootstrapLearnerSession();

    expect(onAuthStateChange).toHaveBeenCalledTimes(2);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("signOut clears the store and calls supabase signOut with local scope", async () => {
    useLearnerSession.setState({ session: fakeSession(), status: "authenticated" });

    await useLearnerSession.getState().signOut();

    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(useLearnerSession.getState().status).toBe("unauthenticated");
    expect(useLearnerSession.getState().session).toBeNull();
  });
});
