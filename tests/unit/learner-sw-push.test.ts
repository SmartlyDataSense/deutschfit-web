/**
 * `public/sw.js` — S12 · Task B1.
 *
 * The service worker is plain hand-written JS with no build step and no
 * exports, so it can't be imported. These tests read the shipped file and
 * evaluate it against a fabricated `self`, capturing the listeners it
 * registers — which means they exercise the EXACT bytes we deploy, not a
 * TypeScript re-implementation of them.
 *
 * What's pinned:
 *   - A malformed / missing / non-JSON payload shows fallback copy instead
 *     of throwing (a throwing push handler can get the subscription dropped
 *     by the browser).
 *   - `url` is same-origin-only. A leading-slash test alone is NOT enough:
 *     "//evil.com" and "/\evil.com" both start with "/" but browsers resolve
 *     them as off-origin absolute URLs, so `clients.openWindow()` would take
 *     the learner off the app entirely. These cases are the reason
 *     `safePath()` exists — they fail against a `charAt(0) === "/"` guard.
 *   - The click handler navigates an existing same-origin tab when there is
 *     one, and only opens a new window otherwise.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const SW_SOURCE = readFileSync(
  path.resolve(__dirname, "../../public/sw.js"),
  "utf8",
);

const ORIGIN = "https://app.deutschfit.test";

type Listener = (event: unknown) => void;

interface ShownNotification {
  title: string;
  options: {
    body: string;
    icon: string;
    badge: string;
    tag: string;
    data: { url: string };
  };
}

interface SwHarness {
  listeners: Record<string, Listener>;
  shown: ShownNotification[];
  openWindow: ReturnType<typeof vi.fn>;
  matchAllResult: Array<{ url: string; navigate: ReturnType<typeof vi.fn>; focus: ReturnType<typeof vi.fn> }>;
  /** Fires the `push` listener and resolves once its waitUntil settles. */
  push(data: string | null): Promise<void>;
  /** Fires the `notificationclick` listener with the given data payload. */
  click(data: unknown): Promise<void>;
  /** The single notification shown so far — asserts exactly one exists. */
  only(): ShownNotification;
}

/** Evaluate the real sw.js against a fake global scope and return handles. */
function loadServiceWorker(): SwHarness {
  const listeners: Record<string, Listener> = {};
  const shown: ShownNotification[] = [];
  const openWindow = vi.fn(() => Promise.resolve(null));
  const harness: Partial<SwHarness> = {
    listeners,
    shown,
    openWindow,
    matchAllResult: [],
  };

  const self = {
    addEventListener(type: string, fn: Listener) {
      listeners[type] = fn;
    },
    skipWaiting: vi.fn(),
    location: { origin: ORIGIN },
    clients: {
      claim: vi.fn(() => Promise.resolve()),
      matchAll: vi.fn(() => Promise.resolve(harness.matchAllResult)),
      openWindow,
    },
    registration: {
      showNotification(title: string, options: ShownNotification["options"]) {
        shown.push({ title, options });
        return Promise.resolve();
      },
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function("self", "URL", SW_SOURCE)(self, URL);

  const listener = (type: string): Listener => {
    const fn = listeners[type];
    if (!fn) throw new Error(`sw.js registered no "${type}" listener`);
    return fn;
  };

  harness.only = () => {
    if (shown.length !== 1) {
      throw new Error(`expected exactly 1 notification, got ${shown.length}`);
    }
    return shown[0]!;
  };

  harness.push = async (data: string | null) => {
    let waited: unknown;
    listener("push")({
      data:
        data === null
          ? null
          : {
              json() {
                return JSON.parse(data);
              },
            },
      waitUntil(p: unknown) {
        waited = p;
      },
    });
    await waited;
  };

  harness.click = async (data: unknown) => {
    let waited: unknown;
    listener("notificationclick")({
      notification: { close: vi.fn(), data },
      waitUntil(p: unknown) {
        waited = p;
      },
    });
    await waited;
  };

  return harness as SwHarness;
}

describe("public/sw.js — push handler", () => {
  let sw: SwHarness;

  beforeEach(() => {
    sw = loadServiceWorker();
  });

  it("registers install, activate, push and notificationclick listeners", () => {
    expect(Object.keys(sw.listeners).sort()).toEqual([
      "activate",
      "install",
      "notificationclick",
      "push",
    ]);
  });

  it("renders the payload's title, body, tag and url", async () => {
    await sw.push(
      JSON.stringify({
        type: "grading_ready",
        title: "Ta correction est prête",
        body: "Ouvre-la pour voir les points gagnés.",
        url: "/fr/app/ecrire/abc-123",
      }),
    );

    expect(sw.shown).toHaveLength(1);
    expect(sw.only().title).toBe("Ta correction est prête");
    expect(sw.only().options.body).toBe("Ouvre-la pour voir les points gagnés.");
    expect(sw.only().options.tag).toBe("grading_ready");
    expect(sw.only().options.data.url).toBe("/fr/app/ecrire/abc-123");
  });

  it("preserves query and hash on an in-app path", async () => {
    await sw.push(
      JSON.stringify({
        title: "T",
        body: "B",
        url: "/fr/app/ecrire/123?from=push#feedback",
      }),
    );
    expect(sw.only().options.data.url).toBe(
      "/fr/app/ecrire/123?from=push#feedback",
    );
  });

  it.each([
    ["protocol-relative", "//evil.com"],
    ["backslash-prefixed", "/\\evil.com"],
    ["absolute off-origin", "https://evil.com/x"],
    ["scheme-relative with path", "//evil.com/fr/app"],
    ["not a path at all", "fr/app"],
    ["non-string", 42],
    ["missing", undefined],
  ])("falls back to /fr/app for a %s url", async (_label, url) => {
    await sw.push(JSON.stringify({ title: "T", body: "B", url }));
    expect(sw.only().options.data.url).toBe("/fr/app");
  });

  it("shows fallback copy when the payload is absent", async () => {
    await sw.push(null);
    expect(sw.only().title).toBe("DeutschFit");
    expect(sw.only().options.data.url).toBe("/fr/app");
  });

  it("shows fallback copy — and does not throw — on a non-JSON payload", async () => {
    await expect(sw.push("this is not json")).resolves.toBeUndefined();
    expect(sw.only().title).toBe("DeutschFit");
  });

  it("shows fallback copy when title or body is missing", async () => {
    await sw.push(JSON.stringify({ type: "coach_reply", body: "orphan" }));
    expect(sw.only().title).toBe("DeutschFit");
  });
});

describe("public/sw.js — notificationclick handler", () => {
  let sw: SwHarness;

  beforeEach(() => {
    sw = loadServiceWorker();
  });

  it("navigates and focuses an existing same-origin tab", async () => {
    const client = {
      url: `${ORIGIN}/fr/app`,
      navigate: vi.fn(),
      focus: vi.fn(),
    };
    sw.matchAllResult = [client];

    await sw.click({ url: "/fr/app/coach" });

    expect(client.navigate).toHaveBeenCalledWith("/fr/app/coach");
    expect(client.focus).toHaveBeenCalled();
    expect(sw.openWindow).not.toHaveBeenCalled();
  });

  it("opens a new window when no same-origin tab is open", async () => {
    sw.matchAllResult = [];
    await sw.click({ url: "/fr/app/coach" });
    expect(sw.openWindow).toHaveBeenCalledWith("/fr/app/coach");
  });

  it("re-sanitizes at click time — an off-origin data.url never navigates away", async () => {
    sw.matchAllResult = [];
    await sw.click({ url: "//evil.com" });
    expect(sw.openWindow).toHaveBeenCalledWith("/fr/app");
  });

  it("falls back when the notification carries no data", async () => {
    sw.matchAllResult = [];
    await sw.click(undefined);
    expect(sw.openWindow).toHaveBeenCalledWith("/fr/app");
  });
});
