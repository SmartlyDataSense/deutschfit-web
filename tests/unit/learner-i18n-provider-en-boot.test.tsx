/**
 * `LearnerI18nProvider` must not render a permanent blank page when the
 * lazy EN catalog load rejects (S13 whole-branch review, final-fixes
 * finding 1).
 *
 * Reachable sequences this guards:
 *   - Fresh load of `/en/app` with one EN chunk 404ing (deploy skew on a
 *     stale HTML payload) or a network blip.
 *   - An FR boot whose background EN load blips, poisoning the cached
 *     promise; the user later switches language in Settings
 *     (`SettingsScreen.tsx` -> `router.replace` to `/en/...`) — `isEnBoot`
 *     flips true and, pre-fix, `enReady` could never become true.
 *
 * Reproduces the reviewer's original repro window: 50 microtask turns +
 * 100ms after mount, `lng="en"`. Pre-fix this leaves `container.innerHTML
 * === ""` forever (the provider renders `null`); post-fix children render.
 */
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Not hoisted so `state.fail` can be reset per test alongside
// vi.resetModules() — see the sibling module-level test,
// learner-i18n-en-rejection.test.ts, for why doMock is used here instead
// of the hoisted vi.mock.
const state = { fail: true };
vi.doMock("@/learner/locales/en/apprendre.json", async (importOriginal) => {
  if (state.fail) throw new Error("simulated EN chunk load failure (apprendre)");
  return importOriginal();
});

function installLocalStorageMock(): void {
  let store = new Map<string, string>();
  const mock: Storage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store = new Map();
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(window, "localStorage", {
    value: mock,
    configurable: true,
    writable: true,
  });
}

async function flushEnBootWindow(): Promise<void> {
  // Matches the reviewer's original repro: 50 microtask turns + 100ms.
  await act(async () => {
    for (let i = 0; i < 50; i++) {
      await Promise.resolve();
    }
    await new Promise((r) => setTimeout(r, 100));
  });
}

describe("LearnerI18nProvider — en boot survives a rejected EN catalog import", () => {
  beforeEach(() => {
    installLocalStorageMock();
    state.fail = true;
    vi.resetModules();
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("renders children instead of staying blank forever on an /en boot when one EN namespace import rejects", async () => {
    const { LearnerI18nProvider } = await import("@/learner/core/i18n/LearnerI18nProvider");

    const { container } = render(
      <LearnerI18nProvider lng="en">
        <div data-testid="content">hello</div>
      </LearnerI18nProvider>
    );

    await flushEnBootWindow();

    // The exact failure the reviewer proved: pre-fix this is "".
    expect(container.innerHTML).not.toBe("");
    expect(container.querySelector('[data-testid="content"]')).not.toBeNull();
  });

  it("a subsequent whenEnReady() call retries rather than returning the poisoned promise", async () => {
    const i18nModule = await import("@/learner/core/i18n");
    const { LearnerI18nProvider } = await import("@/learner/core/i18n/LearnerI18nProvider");

    render(
      <LearnerI18nProvider lng="en">
        <div data-testid="content">hello</div>
      </LearnerI18nProvider>
    );
    await flushEnBootWindow();

    // The failed namespace never landed on the first (rejecting) attempt.
    expect(i18nModule.learnerI18n.hasResourceBundle("en", "apprendre")).toBe(false);

    // Let the import succeed now and retry directly — this must not be the
    // same cached rejected promise from before.
    state.fail = false;
    await i18nModule.whenEnReady().catch(() => {
      // Defensive swallow so this assertion also runs meaningfully under
      // the pre-fix implementation instead of throwing out of the test.
    });

    expect(i18nModule.learnerI18n.hasResourceBundle("en", "apprendre")).toBe(true);
  });
});
