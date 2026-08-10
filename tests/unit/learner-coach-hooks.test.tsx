/**
 * Coach hooks — S9 · Task 9.2.
 *
 * Covers the load-bearing chat state machine (`useCoachChat`), the
 * per-user opener flag (`useCoachOpenerFlag`), the weekly-plan loader
 * (`useCoachPlan`), and `useCoachSessions`'s exported `formatDateLabel`.
 *
 * Deps are scripted directly through each hook's `deps` argument — no
 * `vi.mock` of the facade modules — per this repo's established hook-test
 * idiom (`learner-dialogue-session-hook.test.ts`).
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCoachChat } from "@/learner/coach/hooks/useCoachChat";
import {
  __resetCoachOpenerFlagStoreForTests,
  useCoachOpenerFlag,
} from "@/learner/coach/hooks/useCoachOpenerFlag";
import { useCoachPlan } from "@/learner/coach/hooks/useCoachPlan";
import { formatDateLabel } from "@/learner/coach/hooks/useCoachSessions";
import type { CoachMessage, CoachSendRequest, CoachSendResponse } from "@/learner/coach/types";
import type { CoachPlanResponse } from "@/learner/coach/planApi";

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// useCoachChat
// ---------------------------------------------------------------------------
describe("useCoachChat", () => {
  it("optimistic send: success appends a complete user turn + the server assistant turn", async () => {
    const sendMock = vi
      .fn<(req: CoachSendRequest) => Promise<CoachSendResponse>>()
      .mockResolvedValue({ messageId: "srv", text: "Antwort", createdAt: "c" });
    const onSendOutcome = vi.fn();

    const { result } = renderHook(() =>
      useCoachChat({
        userId: "u1",
        threadId: "t1",
        onSendOutcome,
        deps: { sendCoachMessage: sendMock },
      })
    );

    await act(async () => {
      await result.current.send("hallo");
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0]).toMatchObject({
      role: "user",
      text: "hallo",
      status: "complete",
    });
    expect(result.current.messages[1]).toMatchObject({
      id: "srv",
      role: "assistant",
      text: "Antwort",
      createdAt: "c",
      status: "complete",
    });
    expect(result.current.phase).toBe("complete");
    expect(onSendOutcome).toHaveBeenCalledWith(expect.objectContaining({ kind: "success" }));
  });

  it("failure keeps the user turn with status:error and surfaces the thrown code", async () => {
    const sendMock = vi
      .fn<(req: CoachSendRequest) => Promise<CoachSendResponse>>()
      .mockRejectedValue(new Error("coach_rate_limited"));
    const onSendOutcome = vi.fn();

    const { result } = renderHook(() =>
      useCoachChat({
        userId: "u1",
        threadId: "t1",
        onSendOutcome,
        deps: { sendCoachMessage: sendMock },
      })
    );

    await act(async () => {
      await result.current.send("hallo");
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]).toMatchObject({
      role: "user",
      status: "error",
      errorMessage: "coach_rate_limited",
    });
    expect(result.current.phase).toBe("error");
    expect(result.current.lastError).toBe("coach_rate_limited");
    expect(onSendOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "error", code: "coach_rate_limited" })
    );
  });

  it("in-flight guard: a second send() while the first is pending is dropped", async () => {
    let resolveFirst: ((v: CoachSendResponse) => void) | null = null;
    const sendMock = vi.fn<(req: CoachSendRequest) => Promise<CoachSendResponse>>(
      () =>
        new Promise<CoachSendResponse>((resolve) => {
          resolveFirst = resolve;
        })
    );

    const { result } = renderHook(() =>
      useCoachChat({ userId: "u1", threadId: "t1", deps: { sendCoachMessage: sendMock } })
    );

    let p1: Promise<void> = Promise.resolve();
    act(() => {
      p1 = result.current.send("first");
      void result.current.send("second");
    });

    expect(sendMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirst?.({ messageId: "srv", text: "ok", createdAt: "c" });
      await p1;
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(result.current.messages.filter((m) => m.role === "user")).toHaveLength(1);
  });

  it("history passed to the transport is the pre-append array", async () => {
    const seed: CoachMessage = {
      id: "seed-1",
      role: "assistant",
      text: "Willkommen",
      createdAt: "2026-08-01T00:00:00Z",
      status: "complete",
    };
    const sendMock = vi
      .fn<(req: CoachSendRequest) => Promise<CoachSendResponse>>()
      .mockResolvedValue({ messageId: "srv", text: "ok", createdAt: "c" });

    const { result } = renderHook(() =>
      useCoachChat({
        userId: "u1",
        threadId: "t1",
        initialMessages: [seed],
        deps: { sendCoachMessage: sendMock },
      })
    );

    await act(async () => {
      await result.current.send("hallo");
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    const sentRequest = sendMock.mock.calls[0]?.[0];
    expect(sentRequest?.history).toEqual([seed]);
    expect(sentRequest?.history.some((m) => m.text === "hallo")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// useCoachOpenerFlag
// ---------------------------------------------------------------------------
function installMemoryStorage(): Record<string, string> {
  const data: Record<string, string> = {};
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => (k in data ? data[k] : null),
      setItem: (k: string, v: string) => {
        data[k] = v;
      },
      removeItem: (k: string) => {
        delete data[k];
      },
    } as unknown as Storage,
  });
  return data;
}

describe("useCoachOpenerFlag", () => {
  let data: Record<string, string>;
  beforeEach(() => {
    data = installMemoryStorage();
    __resetCoachOpenerFlagStoreForTests();
  });

  it("is unhydrated on first render: seen:false, hydrated:false", () => {
    const { result } = renderHook(() => useCoachOpenerFlag("user-a"));
    expect(result.current.seen).toBe(false);
    expect(result.current.hydrated).toBe(false);
  });

  it("hydrates from localStorage — reads a previously-set 'true' flag", async () => {
    data["@deutschfit/coach-opener-seen/user-a"] = "true";
    const { result } = renderHook(() => useCoachOpenerFlag("user-a"));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.hydrated).toBe(true);
    expect(result.current.seen).toBe(true);
  });

  it("markSeen() writes the per-user key and flips seen to true", async () => {
    const { result } = renderHook(() => useCoachOpenerFlag("user-a"));
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.markSeen();
    });

    expect(result.current.seen).toBe(true);
    expect(data["@deutschfit/coach-opener-seen/user-a"]).toBe("true");
  });

  it("per-user isolation: two userIds do not collide", async () => {
    // A single consumer rebinding across a user switch — mirrors mobile's
    // real usage (one Coach screen, one active user at a time). Mounting
    // two *simultaneous* hook instances against the shared store here
    // would fight over `boundUserId` (each effect re-triggers the other's
    // rehydration in a loop), which isn't a real app scenario.
    const { result, rerender } = renderHook(
      ({ userId }: { userId: string }) => useCoachOpenerFlag(userId),
      { initialProps: { userId: "user-a" } }
    );
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await result.current.markSeen();
    });
    expect(result.current.seen).toBe(true);
    expect(data["@deutschfit/coach-opener-seen/user-a"]).toBe("true");

    rerender({ userId: "user-b" });
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.seen).toBe(false);
    expect(data["@deutschfit/coach-opener-seen/user-a"]).toBe("true");
    expect(data["@deutschfit/coach-opener-seen/user-b"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// useCoachPlan
// ---------------------------------------------------------------------------
function makePlan(overrides: Partial<CoachPlanResponse> = {}): CoachPlanResponse {
  return {
    planMarkdown: "# Plan\nDu solltest 'trotzdem' üben.",
    grammarDeepLinks: [],
    modelVersion: "v1",
    promptVersion: "p1",
    generatedAt: "2026-08-01T00:00:00Z",
    replay: false,
    drills: [],
    ...overrides,
  };
}

describe("useCoachPlan", () => {
  it("success with signal -> fallback:false, phase:ready", async () => {
    const getCoachPlanMock = vi
      .fn<() => Promise<CoachPlanResponse>>()
      .mockResolvedValue(makePlan());
    const { result } = renderHook(() => useCoachPlan({ deps: { getCoachPlan: getCoachPlanMock } }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.phase).toBe("ready");
    expect(result.current.fallback).toBe(false);
    expect(result.current.observation?.hasSignal).toBe(true);
  });

  it("getCoachPlan rejection -> phase:error, fallback:true", async () => {
    const getCoachPlanMock = vi
      .fn<() => Promise<CoachPlanResponse>>()
      .mockRejectedValue(new Error("coach_plan_failed"));
    const { result } = renderHook(() => useCoachPlan({ deps: { getCoachPlan: getCoachPlanMock } }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.phase).toBe("error");
    expect(result.current.fallback).toBe(true);
    expect(result.current.error).toBe("coach_plan_failed");
  });
});

// ---------------------------------------------------------------------------
// formatDateLabel (exported from useCoachSessions)
// ---------------------------------------------------------------------------
describe("formatDateLabel", () => {
  it("today -> Aujourd'hui", () => {
    expect(formatDateLabel(new Date().toISOString())).toBe("Aujourd'hui");
  });

  it("yesterday -> Hier", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(formatDateLabel(yesterday.toISOString())).toBe("Hier");
  });
});
