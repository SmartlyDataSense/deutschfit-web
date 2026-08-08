/**
 * PostHog analytics gating (`src/learner/core/analytics/posthog.ts`).
 *
 * `posthog-js` is mocked at the module boundary — same precedent as
 * `learner-session.test.ts` mocking `getBrowserClient`. Covers:
 *   - no-op behaviour (no client constructed, no throw) when
 *     `NEXT_PUBLIC_POSTHOG_KEY` is unset — the dev/test safety contract.
 *   - client construction as a *named* instance ("learner") with
 *     autocapture/pageview capture off, once a key is present.
 *   - `initPostHog()` idempotency.
 *   - `trackEvent` / `identifyUser` / `resetAnalyticsUser` forward to the
 *     underlying client when one exists.
 *   - `getPostHogHost()` default vs. env override.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockInstance, init } = vi.hoisted(() => {
  const mockInstance = {
    capture: vi.fn(),
    identify: vi.fn(),
    reset: vi.fn(),
  };
  return { mockInstance, init: vi.fn(() => mockInstance) };
});

vi.mock("posthog-js", () => ({
  default: { init },
}));

import {
  __resetPostHogForTests,
  getPostHogHost,
  getPostHogKey,
  identifyUser,
  initPostHog,
  resetAnalyticsUser,
  trackEvent,
} from "@/learner/core/analytics/posthog";

const ORIGINAL_ENV = { ...process.env };

function setEnv(key: string | undefined, host?: string): void {
  if (key === undefined) {
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
  } else {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = key;
  }
  if (host === undefined) {
    delete process.env.NEXT_PUBLIC_POSTHOG_HOST;
  } else {
    process.env.NEXT_PUBLIC_POSTHOG_HOST = host;
  }
}

beforeEach(() => {
  __resetPostHogForTests();
  init.mockClear();
  mockInstance.capture.mockClear();
  mockInstance.identify.mockClear();
  mockInstance.reset.mockClear();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  __resetPostHogForTests();
});

describe("getPostHogHost", () => {
  it("defaults to the EU region when unset", () => {
    setEnv(undefined, undefined);
    expect(getPostHogHost()).toBe("https://eu.i.posthog.com");
  });

  it("reads NEXT_PUBLIC_POSTHOG_HOST when set", () => {
    setEnv(undefined, "https://custom.posthog.example");
    expect(getPostHogHost()).toBe("https://custom.posthog.example");
  });
});

describe("getPostHogKey", () => {
  it("returns undefined when unset or empty", () => {
    setEnv(undefined);
    expect(getPostHogKey()).toBeUndefined();
    setEnv("");
    expect(getPostHogKey()).toBeUndefined();
  });

  it("returns the key when set", () => {
    setEnv("phc_test_key");
    expect(getPostHogKey()).toBe("phc_test_key");
  });
});

describe("no key configured — every export is a silent no-op", () => {
  beforeEach(() => setEnv(undefined));

  it("initPostHog() never constructs a client", () => {
    initPostHog();
    expect(init).not.toHaveBeenCalled();
  });

  it("trackEvent / identifyUser / resetAnalyticsUser never throw and never touch the SDK", () => {
    expect(() => trackEvent("app_opened", { cold_start: true })).not.toThrow();
    expect(() => identifyUser("user-1")).not.toThrow();
    expect(() => resetAnalyticsUser()).not.toThrow();
    expect(init).not.toHaveBeenCalled();
    expect(mockInstance.capture).not.toHaveBeenCalled();
    expect(mockInstance.identify).not.toHaveBeenCalled();
    expect(mockInstance.reset).not.toHaveBeenCalled();
  });
});

describe("key configured — client is constructed as a named, explicit-track-only instance", () => {
  beforeEach(() => setEnv("phc_test_key"));

  it("initPostHog() calls posthog.init once with the learner instance name and autocapture/pageview off", () => {
    initPostHog();
    expect(init).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledWith(
      "phc_test_key",
      expect.objectContaining({
        api_host: "https://eu.i.posthog.com",
        autocapture: false,
        capture_pageview: false,
      }),
      "learner"
    );
  });

  it("initPostHog() is idempotent — a second call does not re-init", () => {
    initPostHog();
    initPostHog();
    expect(init).toHaveBeenCalledTimes(1);
  });

  it("trackEvent forwards to the underlying client's capture()", () => {
    trackEvent("signin_succeeded", { method: "password" });
    expect(mockInstance.capture).toHaveBeenCalledWith("signin_succeeded", { method: "password" });
  });

  it("identifyUser forwards userId + traits to identify()", () => {
    identifyUser("user-1", { email: "marie@example.com" });
    expect(mockInstance.identify).toHaveBeenCalledWith("user-1", { email: "marie@example.com" });
  });

  it("resetAnalyticsUser forwards to reset() once a client exists", () => {
    // Force client construction first (reset() only acts on an existing client).
    trackEvent("app_opened");
    resetAnalyticsUser();
    expect(mockInstance.reset).toHaveBeenCalledTimes(1);
  });

  it("resetAnalyticsUser is a no-op if no client was ever constructed", () => {
    resetAnalyticsUser();
    expect(mockInstance.reset).not.toHaveBeenCalled();
  });

  it("only constructs the client once across multiple calls (lazy singleton)", () => {
    trackEvent("app_opened");
    identifyUser("user-1");
    resetAnalyticsUser();
    expect(init).toHaveBeenCalledTimes(1);
  });
});
