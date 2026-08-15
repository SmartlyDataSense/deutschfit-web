/**
 * S12 — useWebPushSettings state machine.
 *
 * Invariants pinned:
 *   - denied permission → state "denied", NOT "off" (a re-promptable-
 *     looking toggle would silently no-op after a browser denial).
 *   - unsupported browser: enable() resolves without throwing and
 *     never calls subscribeToPush.
 *   - a PushPermissionDeniedError during enable() transitions to
 *     "denied" (user dismissed/denied the live prompt), not an error.
 *   - other enable() failures → back to "off" with hasError = true.
 */
import { createElement } from "react";
import { act, render, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The mocks are annotated with the WIDE return types (WebPushSupport,
// Promise<void>) rather than inferred from their default implementations.
// Inference would narrow supportMock to "supported" and subscribeMock to
// Promise<undefined>, so the very overrides these tests exist to exercise
// — mockReturnValue("unsupported"), a never-resolving Promise<void> —
// would not typecheck.
const { supportMock, getSubMock, subscribeMock, unsubscribeMock } = vi.hoisted(() => ({
  supportMock: vi.fn((): "supported" | "unsupported" => "supported"),
  getSubMock: vi.fn(async (): Promise<unknown> => null),
  subscribeMock: vi.fn(async (): Promise<void> => undefined),
  unsubscribeMock: vi.fn(async (): Promise<void> => undefined),
}));

vi.mock("@/learner/core/notifications/webPush", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/core/notifications/webPush")>();
  return { ...actual, getWebPushSupport: supportMock };
});

vi.mock("@/learner/core/notifications/subscription", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/core/notifications/subscription")>();
  return {
    ...actual,
    getExistingSubscription: getSubMock,
    subscribeToPush: subscribeMock,
    unsubscribeFromPush: unsubscribeMock,
  };
});

import { PushPermissionDeniedError } from "@/learner/core/notifications/subscription";
import { useWebPushSettings } from "@/learner/core/notifications/useWebPushSettings";

beforeEach(() => {
  supportMock.mockReturnValue("supported");
  getSubMock.mockReset().mockResolvedValue(null);
  subscribeMock.mockReset().mockResolvedValue(undefined);
  unsubscribeMock.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal("Notification", { permission: "default" });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useWebPushSettings (S12)", () => {
  it("the FIRST render is 'busy', never 'unsupported' (SSR / pre-hydration paint)", () => {
    // Support can only be read in an effect (it touches `window`), so the
    // initial state is what Next.js server-renders and what the user sees
    // until hydration finishes. Starting at "unsupported" made the settings
    // screen claim "Notifications non disponibles" on a perfectly capable
    // browser — caught live in the B7 pass, not by any earlier test.
    //
    // Recording every render is what makes this real: asserting on
    // `result.current` after renderHook would read a value the effect has
    // already overwritten, and would pass against the old default too.
    const seen: string[] = [];
    function Probe() {
      seen.push(useWebPushSettings().state);
      return null;
    }
    // Support IS available here — an "unsupported" first paint would be a
    // lie about this very browser, which is the defect being pinned.
    supportMock.mockReturnValue("supported");
    render(createElement(Probe));
    expect(seen[0]).toBe("busy");
    expect(seen).not.toContain("unsupported");
  });

  it("resolves to 'off' when supported with no existing subscription", async () => {
    const { result } = renderHook(() => useWebPushSettings());
    await waitFor(() => expect(result.current.state).toBe("off"));
  });

  it("resolves to 'on' when a subscription already exists", async () => {
    getSubMock.mockResolvedValue({ endpoint: "https://x" });
    const { result } = renderHook(() => useWebPushSettings());
    await waitFor(() => expect(result.current.state).toBe("on"));
  });

  it("resolves to 'denied' when Notification.permission is denied — never 'off'", async () => {
    vi.stubGlobal("Notification", { permission: "denied" });
    const { result } = renderHook(() => useWebPushSettings());
    await waitFor(() => expect(result.current.state).toBe("denied"));
  });

  it("resolves to 'unsupported' and enable() is a safe no-op (never throws, never subscribes)", async () => {
    supportMock.mockReturnValue("unsupported");
    const { result } = renderHook(() => useWebPushSettings());
    await waitFor(() => expect(result.current.state).toBe("unsupported"));
    await act(async () => {
      await expect(result.current.enable()).resolves.toBeUndefined();
    });
    expect(subscribeMock).not.toHaveBeenCalled();
  });

  it("enable() success lands on 'on'", async () => {
    const { result } = renderHook(() => useWebPushSettings());
    await waitFor(() => expect(result.current.state).toBe("off"));
    await act(async () => {
      await result.current.enable();
    });
    expect(result.current.state).toBe("on");
    expect(result.current.hasError).toBe(false);
  });

  it("enable() hitting a live denial lands on 'denied' without error flag", async () => {
    subscribeMock.mockRejectedValue(new PushPermissionDeniedError());
    const { result } = renderHook(() => useWebPushSettings());
    await waitFor(() => expect(result.current.state).toBe("off"));
    await act(async () => {
      await result.current.enable();
    });
    expect(result.current.state).toBe("denied");
    expect(result.current.hasError).toBe(false);
  });

  it("enable() failure returns to 'off' with hasError", async () => {
    subscribeMock.mockRejectedValue(new Error("db_write_failed"));
    const { result } = renderHook(() => useWebPushSettings());
    await waitFor(() => expect(result.current.state).toBe("off"));
    await act(async () => {
      await result.current.enable();
    });
    expect(result.current.state).toBe("off");
    expect(result.current.hasError).toBe(true);
  });

  it("disable() unsubscribes and lands on 'off'", async () => {
    getSubMock.mockResolvedValue({ endpoint: "https://x" });
    const { result } = renderHook(() => useWebPushSettings());
    await waitFor(() => expect(result.current.state).toBe("on"));
    await act(async () => {
      await result.current.disable();
    });
    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe("off");
  });

  it("enable() in flight exposes 'busy', then lands on 'on'", async () => {
    // Pins the intermediate state the toggle disables itself on —
    // without it, a double-click while the permission prompt is open
    // fires two overlapping subscribes.
    let resolveSubscribe!: () => void;
    subscribeMock.mockImplementation(
      () => new Promise<void>((resolve) => (resolveSubscribe = resolve))
    );
    const { result } = renderHook(() => useWebPushSettings());
    await waitFor(() => expect(result.current.state).toBe("off"));
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.enable(); // deliberately NOT awaited yet
    });
    await waitFor(() => expect(result.current.state).toBe("busy"));
    await act(async () => {
      resolveSubscribe();
      await pending;
    });
    expect(result.current.state).toBe("on");
  });
});
