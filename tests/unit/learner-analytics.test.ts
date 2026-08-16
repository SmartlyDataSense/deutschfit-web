/**
 * PostHog analytics gating (`src/learner/core/analytics/posthog.ts`).
 *
 * `posthog-js` is mocked at the module boundary — same precedent as
 * `learner-session.test.ts` mocking `getBrowserClient`. Vitest intercepts
 * the module's dynamic `import("posthog-js")` through this same manual
 * mock factory (not just static imports), so the lazy-load path below is
 * exercised against the same `mockInstance`/`init` doubles as before.
 *
 * Covers:
 *   - no-op behaviour (no client constructed, no throw) when
 *     `NEXT_PUBLIC_POSTHOG_KEY` is unset — the dev/test safety contract.
 *   - client construction as a *named* instance ("learner") with
 *     autocapture/pageview capture off, once a key is present — behind the
 *     lazy `import("posthog-js")`, so assertions await the load.
 *   - `initPostHog()` idempotency.
 *   - `trackEvent` / `identifyUser` / `resetAnalyticsUser` forward to the
 *     underlying client once the lazy chunk resolves.
 *   - source-scan: no top-level *value* import of `posthog-js` (only
 *     `import type`) — that's the whole point of this task, keeping it out
 *     of the first-load bundle.
 *   - the sign-out race: `identifyUser` then `resetAnalyticsUser` called
 *     back-to-back before the chunk resolves must still end with `reset`
 *     landing after `identify` (never dropped), because `resetAnalyticsUser`
 *     funnels through the same shared load promise instead of no-opping on
 *     `!client`.
 *   - `getPostHogHost()` default vs. env override.
 *   - web#52: `isAnalyticsOptedOut()` reads `LEARNER_ANALYTICS_OPT_OUT_KEY`;
 *     `loadClient()`'s gate refuses to construct a client at all while
 *     opted out (no `init` call, no network); `setAnalyticsOptOut()`
 *     persists the flag AND calls PostHog's own
 *     `opt_out_capturing()`/`opt_in_capturing()` on both an
 *     already-constructed client and a not-yet-constructed one.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockInstance, init } = vi.hoisted(() => {
  const mockInstance = {
    capture: vi.fn(),
    identify: vi.fn(),
    reset: vi.fn(),
    opt_out_capturing: vi.fn(),
    opt_in_capturing: vi.fn(),
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
  isAnalyticsOptedOut,
  resetAnalyticsUser,
  setAnalyticsOptOut,
  trackEvent,
} from "@/learner/core/analytics/posthog";
import { getFlag, LEARNER_ANALYTICS_OPT_OUT_KEY } from "@/learner/core/storage/flags";

// jsdom localStorage is unreliable in this repo (flags.ts docstring) —
// install a minimal in-memory Storage mock, same idiom as
// `learner-settings-core.test.ts`.
function installStorageMock(): void {
  const store = new Map<string, string>();
  const mock = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(window, "localStorage", { value: mock, configurable: true });
}

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

/** Flushes the module's internal `import("posthog-js")` chain (mocked, but still async). */
async function flush(): Promise<void> {
  await (vi.dynamicImportSettled?.() ?? new Promise((r) => setTimeout(r, 0)));
}

beforeEach(() => {
  installStorageMock();
  __resetPostHogForTests();
  init.mockClear();
  mockInstance.capture.mockClear();
  mockInstance.identify.mockClear();
  mockInstance.reset.mockClear();
  mockInstance.opt_out_capturing.mockClear();
  mockInstance.opt_in_capturing.mockClear();
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

  it("initPostHog() never constructs a client", async () => {
    initPostHog();
    await flush();
    expect(init).not.toHaveBeenCalled();
  });

  it("trackEvent / identifyUser / resetAnalyticsUser never throw and never touch the SDK", async () => {
    expect(() => trackEvent("app_opened", { cold_start: true })).not.toThrow();
    expect(() => identifyUser("user-1")).not.toThrow();
    expect(() => resetAnalyticsUser()).not.toThrow();
    await flush();
    expect(init).not.toHaveBeenCalled();
    expect(mockInstance.capture).not.toHaveBeenCalled();
    expect(mockInstance.identify).not.toHaveBeenCalled();
    expect(mockInstance.reset).not.toHaveBeenCalled();
  });
});

describe("key configured — client is constructed as a named, explicit-track-only instance", () => {
  beforeEach(() => setEnv("phc_test_key"));

  it("initPostHog() calls posthog.init once with the learner instance name and autocapture/pageview off", async () => {
    initPostHog();
    await flush();
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

  it("initPostHog() is idempotent — a second call does not re-init", async () => {
    initPostHog();
    initPostHog();
    await flush();
    expect(init).toHaveBeenCalledTimes(1);
  });

  it("trackEvent forwards to the underlying client's capture()", async () => {
    trackEvent("signin_succeeded", { method: "password" });
    await flush();
    expect(mockInstance.capture).toHaveBeenCalledWith("signin_succeeded", { method: "password" });
  });

  it("identifyUser forwards userId + traits to identify()", async () => {
    identifyUser("user-1", { email: "marie@example.com" });
    await flush();
    expect(mockInstance.identify).toHaveBeenCalledWith("user-1", { email: "marie@example.com" });
  });

  it("resetAnalyticsUser forwards to reset() once the (lazily-loaded) client exists", async () => {
    trackEvent("app_opened");
    resetAnalyticsUser();
    await flush();
    expect(mockInstance.reset).toHaveBeenCalledTimes(1);
  });

  it("resetAnalyticsUser lazily loads the client and calls reset() even if nothing loaded it first — a freshly-loaded client's reset is harmless", async () => {
    // Unlike the old synchronous `if (!client) return` shape, reset now
    // funnels through the same shared load promise as identify/capture:
    // no-opping here would be the sign-out race the brief calls out (see
    // the "sign-out race" describe block below for the ordering pin).
    resetAnalyticsUser();
    await flush();
    expect(init).toHaveBeenCalledTimes(1);
    expect(mockInstance.reset).toHaveBeenCalledTimes(1);
  });

  it("only constructs the client once across multiple calls (lazy singleton)", async () => {
    trackEvent("app_opened");
    identifyUser("user-1");
    resetAnalyticsUser();
    await flush();
    expect(init).toHaveBeenCalledTimes(1);
  });

  it("buffers a burst of calls issued before the chunk resolves, then replays them in call order", async () => {
    initPostHog();
    trackEvent("app_opened");
    identifyUser("u1");
    await flush();
    expect(init).toHaveBeenCalledTimes(1);
    expect(mockInstance.capture).toHaveBeenCalledTimes(1);
    expect(mockInstance.identify).toHaveBeenCalledTimes(1);
    const captureOrder = mockInstance.capture.mock.invocationCallOrder[0]!;
    const identifyOrder = mockInstance.identify.mock.invocationCallOrder[0]!;
    expect(captureOrder).toBeLessThan(identifyOrder);
  });

  describe("sign-out race: identify immediately followed by reset, before the chunk resolves", () => {
    it("still calls both, with reset landing LAST — never a signed-out device left identified", async () => {
      // The regression this pins: a `resetAnalyticsUser` that early-returns
      // on `if (!client)` would silently drop this reset (client is still
      // `null` at this point — the import() promise hasn't settled), and
      // the queued `identify` would land after sign-out, leaving a shared
      // device identified as the previous user. Do NOT assert "reset was
      // never called" — that pins the regression as correct.
      identifyUser("u1");
      resetAnalyticsUser();
      await flush();

      expect(mockInstance.identify).toHaveBeenCalledTimes(1);
      expect(mockInstance.reset).toHaveBeenCalledTimes(1);

      const identifyOrder = mockInstance.identify.mock.invocationCallOrder[0]!;
      const resetOrder = mockInstance.reset.mock.invocationCallOrder[0]!;
      expect(resetOrder).toBeGreaterThan(identifyOrder);
    });
  });
});

describe("web#52: isAnalyticsOptedOut() reads LEARNER_ANALYTICS_OPT_OUT_KEY", () => {
  it("reads false when the key is unset", () => {
    expect(isAnalyticsOptedOut()).toBe(false);
  });

  it('reads true only for the literal "true" value, same convention as mobile', () => {
    window.localStorage.setItem(LEARNER_ANALYTICS_OPT_OUT_KEY, "true");
    expect(isAnalyticsOptedOut()).toBe(true);

    window.localStorage.setItem(LEARNER_ANALYTICS_OPT_OUT_KEY, "yes");
    expect(isAnalyticsOptedOut()).toBe(false);
  });
});

describe("web#52: opted out — the client is never constructed and never captures", () => {
  beforeEach(() => {
    setEnv("phc_test_key");
    window.localStorage.setItem(LEARNER_ANALYTICS_OPT_OUT_KEY, "true");
  });

  it("initPostHog() never calls posthog.init while opted out", async () => {
    initPostHog();
    await flush();
    expect(init).not.toHaveBeenCalled();
  });

  it("trackEvent() never constructs a client and never captures while opted out", async () => {
    trackEvent("app_opened");
    await flush();
    expect(init).not.toHaveBeenCalled();
    expect(mockInstance.capture).not.toHaveBeenCalled();
  });
});

describe("web#52: setAnalyticsOptOut() persists the preference and drives PostHog's own opt-out API", () => {
  beforeEach(() => setEnv("phc_test_key"));

  it("opting out persists the flag under LEARNER_ANALYTICS_OPT_OUT_KEY", () => {
    setAnalyticsOptOut(true);
    expect(getFlag(LEARNER_ANALYTICS_OPT_OUT_KEY)).toBe("true");
    expect(isAnalyticsOptedOut()).toBe(true);
  });

  it("opting back in removes the flag — not just sets it to a falsy value", () => {
    setAnalyticsOptOut(true);
    setAnalyticsOptOut(false);
    expect(getFlag(LEARNER_ANALYTICS_OPT_OUT_KEY)).toBeNull();
    expect(isAnalyticsOptedOut()).toBe(false);
  });

  it("opting out an already-initialised client calls its own opt_out_capturing() — not a hand-rolled suppression flag", async () => {
    // Force construction first.
    trackEvent("app_opened");
    await flush();
    expect(init).toHaveBeenCalledTimes(1);

    setAnalyticsOptOut(true);
    expect(mockInstance.opt_out_capturing).toHaveBeenCalledTimes(1);
  });

  it("opting back in on an opted-out-from-boot session constructs the client (gate lifts) and calls opt_in_capturing()", async () => {
    // Opted out before anything ever ran — loadClient's gate has refused
    // to construct a client at all, so `client` is still null internally.
    setAnalyticsOptOut(true);
    trackEvent("app_opened"); // no-op while opted out
    await flush();
    expect(init).not.toHaveBeenCalled();

    setAnalyticsOptOut(false);
    await flush();
    expect(init).toHaveBeenCalledTimes(1);
    expect(mockInstance.opt_in_capturing).toHaveBeenCalledTimes(1);
  });

  it("opting out DURING the in-flight posthog-js import still reaches the resolved client", async () => {
    // The chunk-load race. `initPostHog()` starts the dynamic import; the
    // learner reaches Settings and opts out before it resolves. In that
    // window `client` is null but `loadPromise` is live — deliberately NO
    // `await flush()` before the toggle, which is exactly what the
    // already-constructed case above does and why it never saw this.
    initPostHog();
    expect(init).not.toHaveBeenCalled(); // still mid-import

    setAnalyticsOptOut(true);
    await flush();

    // The import resolved and assigned `client`. If the opt-out only ran
    // `if (client)`, it was skipped, and `loadClient()` now short-circuits
    // on the truthy `client` BEFORE its `isAnalyticsOptedOut()` gate — so
    // capture would carry on for the rest of the page lifetime.
    expect(init).toHaveBeenCalledTimes(1);
    expect(mockInstance.opt_out_capturing).toHaveBeenCalledTimes(1);

    // Deliberately NOT asserting that a later `trackEvent` drops its
    // `capture` — suppression after `opt_out_capturing()` lives inside
    // posthog-js, and `mockInstance.capture` is a bare `vi.fn()` that does
    // not model it. Asserting it here would test the double, not this
    // module. Reaching `opt_out_capturing()` at all IS the contract.
  });

  it("a toggle survives what a reload looks like here: a fresh isAnalyticsOptedOut() read still sees the persisted flag", () => {
    // This module keeps no in-memory opt-out cache (unlike mobile's
    // `cachedOptOut`) — every `loadClient()` call re-reads localStorage via
    // `isAnalyticsOptedOut()`, so persistence IS the reload story here.
    setAnalyticsOptOut(true);
    expect(isAnalyticsOptedOut()).toBe(true);
  });
});

describe("source scan — posthog-js must not be a top-level value import", () => {
  it('only `import type { PostHog } from "posthog-js"` appears; no value import', () => {
    const source = readFileSync(
      join(process.cwd(), "src/learner/core/analytics/posthog.ts"),
      "utf-8"
    );
    const valueImportPattern = /^import\s+(?!type\b)[^;]*["']posthog-js["']/m;
    expect(valueImportPattern.test(source)).toBe(false);
    // Sanity: the type-only import (or the dynamic import) is still present,
    // so this isn't passing because the module stopped referencing the SDK.
    expect(/posthog-js/.test(source)).toBe(true);
  });
});
