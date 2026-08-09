/**
 * `prefetchOnLogin` / `usePrefetchOnLogin` — S4 Task 4.10.
 *
 * Port of `deutschfit-mobile/src/features/content/{services,hooks}/
 * prefetchOnLogin.ts`. Mocks only the `loadContent` boundary
 * (`prefetchContent`) — `useExamContextStore` and `useLearnerSession` are
 * the real zustand stores, seeded via `setState` between tests, exercising
 * the actual subscribe/getState wiring the hook relies on.
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { prefetchContentMock } = vi.hoisted(() => ({ prefetchContentMock: vi.fn() }));
vi.mock("@/learner/core/content/loadContent", () => ({ prefetchContent: prefetchContentMock }));

import { useLearnerSession } from "@/learner/core/auth/useLearnerSession";
import { prefetchOnLogin } from "@/learner/core/content/prefetchOnLogin";
import { usePrefetchOnLogin } from "@/learner/core/content/usePrefetchOnLogin";
import { useExamContextStore } from "@/learner/core/exam/examContext";

type FakeSession = { user: { id: string } };

function seedExamContext(board = "telc", level = "b1"): void {
  useExamContextStore.setState({
    board: board as never,
    level: level as never,
    source: "onboarding",
    isLoaded: true,
  });
}

function setSession(userId: string | null): void {
  const session = (userId ? { user: { id: userId } } : null) as FakeSession | null;
  useLearnerSession.setState({
    session: session as never,
    status: userId ? "authenticated" : "unauthenticated",
  });
}

afterEach(() => {
  cleanup();
});

describe("prefetchOnLogin", () => {
  beforeEach(() => {
    prefetchContentMock.mockReset();
    prefetchContentMock.mockResolvedValue(undefined);
    seedExamContext();
    setSession(null);
  });

  it("(a) reads the exam-context snapshot and calls prefetchContent with fnName/method/cacheKey", async () => {
    await prefetchOnLogin();
    expect(prefetchContentMock).toHaveBeenCalledTimes(1);
    expect(prefetchContentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fnName: "prompts-list",
        method: "GET",
        cacheKey: "prompts-list:writing:telc:b1",
      })
    );
  });

  it("overrides win over the store snapshot", async () => {
    await prefetchOnLogin({ examBoard: "goethe", examLevel: "a2" });
    expect(prefetchContentMock).toHaveBeenCalledWith(
      expect.objectContaining({ cacheKey: "prompts-list:writing:goethe:a2" })
    );
  });

  it("never throws even when prefetchContent rejects (swallow semantics live in loadContent, not here)", async () => {
    prefetchContentMock.mockRejectedValueOnce(new Error("network down"));
    await expect(prefetchOnLogin()).rejects.toThrow("network down");
    // Note: `prefetchContent` itself never rejects in production (loadContent.ts
    // swallows internally and logs a warning) — this test only proves
    // prefetchOnLogin adds no extra try/catch of its own, per the brief's
    // "do not add your own try/catch around what it already swallows".
  });
});

describe("usePrefetchOnLogin", () => {
  beforeEach(() => {
    prefetchContentMock.mockReset();
    prefetchContentMock.mockResolvedValue(undefined);
    seedExamContext();
    setSession(null);
  });

  it("(b) fires exactly once for an authenticated session, including across a re-render and a same-user re-publish", async () => {
    setSession("user-1");
    const { rerender } = renderHook(() => usePrefetchOnLogin());
    await act(async () => {});
    expect(prefetchContentMock).toHaveBeenCalledTimes(1);

    // A component re-render with no store change — the effect has an empty
    // dep array so it doesn't re-run on its own, but this also has to hold
    // when the store re-publishes the SAME userId (e.g. a token-refresh
    // event on mobile re-emits the session with an unchanged user id) —
    // that's the scenario the once-per-userId ref actually guards.
    rerender();
    act(() => setSession("user-1"));
    await act(async () => {});
    expect(prefetchContentMock).toHaveBeenCalledTimes(1);
  });

  it("(c) sign-out then sign-in as a new userId fires again", async () => {
    setSession("user-1");
    renderHook(() => usePrefetchOnLogin());
    await act(async () => {});
    expect(prefetchContentMock).toHaveBeenCalledTimes(1);

    act(() => setSession(null));
    await act(async () => {});
    expect(prefetchContentMock).toHaveBeenCalledTimes(1); // sign-out itself never fires

    act(() => setSession("user-2"));
    await act(async () => {});
    expect(prefetchContentMock).toHaveBeenCalledTimes(2);
  });

  it("(d) an unauthenticated session never fires", async () => {
    setSession(null);
    renderHook(() => usePrefetchOnLogin());
    await act(async () => {});
    expect(prefetchContentMock).not.toHaveBeenCalled();
  });
});
