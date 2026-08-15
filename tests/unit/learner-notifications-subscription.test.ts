/**
 * S12 — subscription lifecycle unit tests.
 *
 * Invariants pinned:
 *   - register-web-push is called with the EXACT backend contract body
 *     ({endpoint, keys:{p256dh,auth}, user_agent}) — the cross-repo
 *     interface, so a rename on either side fails a named test.
 *   - backend registration failure rolls back the local subscription
 *     (no orphan sub the backend doesn't know about) and rethrows.
 *   - denied permission throws PushPermissionDeniedError BEFORE
 *     pushManager.subscribe is attempted.
 *   - unsubscribe swallows backend failure (410-prune covers it later).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invokeFnMock } = vi.hoisted(() => ({ invokeFnMock: vi.fn() }));
vi.mock("@/learner/core/api/client", () => ({
  invokeFn: invokeFnMock,
  ApiError: class ApiError extends Error {},
}));

import {
  PushPermissionDeniedError,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/learner/core/notifications/subscription";

const ENDPOINT = "https://fcm.googleapis.com/wp/test-sub";
const VAPID_KEY =
  "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8";

function makeFakeSubscription(
  overrides: Partial<{ unsubscribe: () => Promise<boolean> }> = {},
) {
  return {
    endpoint: ENDPOINT,
    toJSON: () => ({
      endpoint: ENDPOINT,
      keys: { p256dh: "client-p256dh", auth: "client-auth" },
    }),
    unsubscribe: overrides.unsubscribe ?? vi.fn().mockResolvedValue(true),
  };
}

let subscribeSpy: ReturnType<typeof vi.fn>;
let existingSub: ReturnType<typeof makeFakeSubscription> | null;

beforeEach(() => {
  invokeFnMock.mockReset().mockResolvedValue({ ok: true });
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", VAPID_KEY);
  existingSub = null;
  subscribeSpy = vi.fn(async () => makeFakeSubscription());
  const registration = {
    pushManager: {
      subscribe: subscribeSpy,
      getSubscription: vi.fn(async () => existingSub),
    },
  };
  Object.defineProperty(window.navigator, "serviceWorker", {
    configurable: true,
    value: {
      register: vi.fn(async () => registration),
      getRegistration: vi.fn(async () => registration),
    },
  });
  vi.stubGlobal("Notification", {
    permission: "default",
    requestPermission: vi.fn(async () => "granted"),
  });
  vi.stubGlobal("PushManager", function PushManager() {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("subscribeToPush (S12)", () => {
  it("subscribes with userVisibleOnly + decoded applicationServerKey and registers with the backend", async () => {
    await subscribeToPush();

    expect(subscribeSpy).toHaveBeenCalledTimes(1);
    const options = subscribeSpy.mock.calls[0]![0];
    expect(options.userVisibleOnly).toBe(true);
    expect(options.applicationServerKey).toBeInstanceOf(Uint8Array);
    expect(options.applicationServerKey.length).toBe(65);
    expect(options.applicationServerKey[0]).toBe(4);

    // The cross-repo contract body, exactly:
    expect(invokeFnMock).toHaveBeenCalledWith("register-web-push", {
      method: "POST",
      body: {
        endpoint: ENDPOINT,
        keys: { p256dh: "client-p256dh", auth: "client-auth" },
        user_agent: window.navigator.userAgent,
      },
    });
  });

  it("throws PushPermissionDeniedError without attempting subscribe when permission is denied", async () => {
    vi.stubGlobal("Notification", {
      permission: "default",
      requestPermission: vi.fn(async () => "denied"),
    });
    await expect(subscribeToPush()).rejects.toBeInstanceOf(
      PushPermissionDeniedError,
    );
    expect(subscribeSpy).not.toHaveBeenCalled();
    expect(invokeFnMock).not.toHaveBeenCalled();
  });

  it("rolls back the local subscription and rethrows when backend registration fails", async () => {
    const unsubscribe = vi.fn().mockResolvedValue(true);
    subscribeSpy.mockImplementation(async () =>
      makeFakeSubscription({ unsubscribe }),
    );
    invokeFnMock.mockRejectedValue(new Error("db_write_failed"));

    await expect(subscribeToPush()).rejects.toThrow("db_write_failed");
    // No orphan: the browser sub the backend never heard about is undone.
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe("unsubscribeFromPush (S12)", () => {
  it("unsubscribes locally then notifies the backend with {endpoint, unsubscribe:true}", async () => {
    existingSub = makeFakeSubscription();
    await unsubscribeFromPush();
    expect(existingSub.unsubscribe).toHaveBeenCalledTimes(1);
    expect(invokeFnMock).toHaveBeenCalledWith("register-web-push", {
      method: "POST",
      body: { endpoint: ENDPOINT, unsubscribe: true },
    });
  });

  it("is a no-op with no existing subscription", async () => {
    existingSub = null;
    await unsubscribeFromPush();
    expect(invokeFnMock).not.toHaveBeenCalled();
  });

  it("swallows a backend failure (server row gets 410-pruned later)", async () => {
    existingSub = makeFakeSubscription();
    invokeFnMock.mockRejectedValue(new Error("network down"));
    await expect(unsubscribeFromPush()).resolves.toBeUndefined();
  });
});
