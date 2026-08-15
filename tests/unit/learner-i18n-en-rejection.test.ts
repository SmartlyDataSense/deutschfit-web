/**
 * `whenEnReady()` must survive a rejected EN catalog import (S13
 * whole-branch review, final-fixes finding 1).
 *
 * Before the fix, `enLoad ??= Promise.all(...)` had no `.catch`: a single
 * rejected dynamic `import()` (deploy-skew 404, network blip) turned
 * `enLoad` into a rejected promise that stayed cached forever — every
 * later `whenEnReady()` call (`enLoad ??= ...` never reassigns once
 * `enLoad` holds a settled-rejected promise) replayed the exact same
 * rejection instead of retrying. Combined with `LearnerI18nProvider`
 * awaiting this same promise with no `.catch`, that meant `/en/...` boots
 * — and later language switches to English — rendered a permanent blank
 * page. See `src/learner/core/i18n/LearnerI18nProvider.tsx` for the
 * provider-level regression test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Not hoisted (`vi.doMock`, not `vi.mock`) so each test can flip
// `state.fail` and re-import the module fresh via `vi.resetModules()`
// without one test's mock state leaking into another's.
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

describe("whenEnReady — a rejected EN chunk does not poison the cache", () => {
  beforeEach(() => {
    installLocalStorageMock();
    state.fail = true;
    vi.resetModules();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("resolves (never rejects) even when one of the 17 EN namespace imports throws", async () => {
    const { initLearnerI18n, whenEnReady } = await import("@/learner/core/i18n");
    initLearnerI18n();

    // This is the exact assertion that fails red: pre-fix, whenEnReady()'s
    // returned promise rejects because Promise.all has no .catch.
    await expect(whenEnReady()).resolves.toBeUndefined();
  });

  it("does not register the namespace whose import rejected", async () => {
    const { initLearnerI18n, whenEnReady, learnerI18n } = await import("@/learner/core/i18n");
    initLearnerI18n();

    await whenEnReady().catch(() => {
      // Swallow here too so this assertion can run under the pre-fix
      // (rejecting) implementation as well as the fixed one.
    });

    expect(learnerI18n.hasResourceBundle("en", "apprendre")).toBe(false);
  });

  it("a later call retries instead of replaying the poisoned promise — once the import can succeed, it lands", async () => {
    const { initLearnerI18n, whenEnReady, learnerI18n } = await import("@/learner/core/i18n");
    initLearnerI18n();

    // First call: the mocked import rejects.
    await whenEnReady().catch(() => {
      // Pre-fix this branch is what keeps the test from throwing outright;
      // post-fix whenEnReady() never rejects so this never runs.
    });
    expect(learnerI18n.hasResourceBundle("en", "apprendre")).toBe(false);

    // The transient failure is over — flip the mock to succeed and call
    // whenEnReady() again on the SAME module instance (no vi.resetModules()
    // here — a fresh module would trivially "retry" for the wrong reason).
    // Pre-fix, `enLoad ??=` still holds the first (rejected) promise, so
    // this call replays the same rejection and `apprendre` never lands.
    state.fail = false;
    await whenEnReady().catch(() => {
      // Same defensive swallow as above.
    });

    expect(learnerI18n.hasResourceBundle("en", "apprendre")).toBe(true);
  });

  it("still emits 'languageChanged' once on the failure path, so a partially-loaded catalog is not stranded", async () => {
    const { initLearnerI18n, whenEnReady, learnerI18n } = await import("@/learner/core/i18n");
    initLearnerI18n();

    const emitSpy = vi.spyOn(learnerI18n, "emit");
    await whenEnReady().catch(() => {
      // Defensive swallow for the pre-fix (rejecting) implementation.
    });

    expect(emitSpy).toHaveBeenCalledWith("languageChanged", expect.anything());
  });
});
