/**
 * Learner i18next instance — init, language resolution, fallback.
 *
 * See `src/learner/core/i18n/index.ts` for the resolution order:
 * override → `localStorage["@deutschfit/lang"]` → `"fr"` default,
 * with `fallbackLng: "en"` for keys missing from the active catalog.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import frCommon from "../../src/learner/locales/fr/common.json";
import enCommon from "../../src/learner/locales/en/common.json";
import {
  LEARNER_LANG_STORAGE_KEY,
  LEARNER_NAMESPACES,
} from "../../src/learner/core/i18n";

// `common:actions.continue` is a real key present in both catalogs with
// distinct FR/EN values — a stable anchor for the resolution assertions
// below (see src/learner/locales/{fr,en}/common.json).
const FR_VALUE = frCommon.actions.continue;
const EN_VALUE = enCommon.actions.continue;

/**
 * jsdom's built-in `window.localStorage` is unreliable under this repo's
 * Node/vitest combo (the getter silently resolves to `undefined` — see
 * task-0.5 report for the repro). The brief calls for a mocked
 * localStorage anyway, so install a minimal in-memory implementation
 * directly on `window` for each test rather than depending on jsdom's.
 */
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

describe("learner i18n — init + language resolution", () => {
  beforeEach(() => {
    installLocalStorageMock();
    // The i18n module holds module-level singleton state (the instance +
    // an "already initialized" guard). Reset the module registry so each
    // test's dynamic import gets a fresh, uninitialized instance instead
    // of sharing state (and thus a resolved language) across tests.
    vi.resetModules();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("defaults to fr when localStorage has no stored language", async () => {
    const { initLearnerI18n } = await import("../../src/learner/core/i18n");
    const instance = initLearnerI18n();

    expect(instance.language).toBe("fr");
    expect(instance.t("common:actions.continue")).toBe(FR_VALUE);
  });

  it("bundles all 16 mobile namespaces", async () => {
    const { initLearnerI18n } = await import("../../src/learner/core/i18n");
    const instance = initLearnerI18n();

    expect(LEARNER_NAMESPACES).toHaveLength(16);
    for (const ns of LEARNER_NAMESPACES) {
      expect(instance.hasResourceBundle("fr", ns)).toBe(true);
      expect(instance.hasResourceBundle("en", ns)).toBe(true);
    }
  });

  it("falls back to en for a key present only in the en catalog", async () => {
    const { initLearnerI18n } = await import("../../src/learner/core/i18n");
    const instance = initLearnerI18n();

    // Inject a namespace with an en-only key to exercise the fallbackLng
    // mechanism directly — the fr/en mobile catalogs happen to share every
    // key today, so there is no naturally-occurring en-only key to assert
    // against.
    instance.addResourceBundle("en", "learnerI18nTestOnly", {
      onlyInEnglish: EN_VALUE,
    });

    expect(instance.t("learnerI18nTestOnly:onlyInEnglish")).toBe(EN_VALUE);
  });

  it("honors an lng override passed to initLearnerI18n", async () => {
    const { initLearnerI18n } = await import("../../src/learner/core/i18n");
    const instance = initLearnerI18n("en");

    expect(instance.language).toBe("en");
    expect(instance.t("common:actions.continue")).toBe(EN_VALUE);
  });

  it("honors localStorage['@deutschfit/lang'] when no override is passed", async () => {
    window.localStorage.setItem(LEARNER_LANG_STORAGE_KEY, "en");

    const { initLearnerI18n } = await import("../../src/learner/core/i18n");
    const instance = initLearnerI18n();

    expect(instance.language).toBe("en");
    expect(instance.t("common:actions.continue")).toBe(EN_VALUE);
  });
});
