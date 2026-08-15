/**
 * Learner i18next instance — init, language resolution, fallback.
 *
 * See `src/learner/core/i18n/index.ts` for the resolution order:
 * override → `localStorage["@deutschfit/lang"]` → `"fr"` default,
 * with `fallbackLng: "en"` for keys missing from the active catalog.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { useTranslation } from "react-i18next";
import type { i18n as I18nInstance } from "i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import frCommon from "../../src/learner/locales/fr/common.json";
import enCommon from "../../src/learner/locales/en/common.json";
import { LEARNER_LANG_STORAGE_KEY, LEARNER_NAMESPACES } from "../../src/learner/core/i18n";

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

describe("learner i18n — EN catalogs are not eagerly imported", () => {
  it("index.ts has no static import from the en locale directory", () => {
    const source = readFileSync(join(process.cwd(), "src/learner/core/i18n/index.ts"), "utf-8");

    expect(source).not.toMatch(/from\s+["']\.\.\/\.\.\/locales\/en\//);
  });
});

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

  it("bundles the 16 mobile namespaces plus the web-only notifications catalog", async () => {
    const { initLearnerI18n, whenEnReady } = await import("../../src/learner/core/i18n");
    const instance = initLearnerI18n();

    // 16 catalogs ported verbatim from deutschfit-mobile + `notifications`
    // (S12), which is web-only: mobile uses Expo push and has no
    // equivalent namespace. Registering a namespace without shipping BOTH
    // catalogs is the failure this loop exists to catch — a missing fr
    // bundle silently falls back to English mid-screen.
    //
    // fr is bundled synchronously (statically imported); en is lazy-loaded
    // in the background — await whenEnReady() before asserting on it.
    expect(LEARNER_NAMESPACES).toHaveLength(17);
    expect(LEARNER_NAMESPACES).toContain("notifications");
    for (const ns of LEARNER_NAMESPACES) {
      expect(instance.hasResourceBundle("fr", ns)).toBe(true);
    }

    await whenEnReady();

    for (const ns of LEARNER_NAMESPACES) {
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
    const { initLearnerI18n, whenEnReady } = await import("../../src/learner/core/i18n");
    const instance = initLearnerI18n("en");

    expect(instance.language).toBe("en");

    // The `en` catalogs are lazy-loaded in the background — await
    // whenEnReady() before asserting a translated (non-fr) string.
    await whenEnReady();
    expect(instance.t("common:actions.continue")).toBe(EN_VALUE);
  });

  it("honors localStorage['@deutschfit/lang'] when no override is passed", async () => {
    window.localStorage.setItem(LEARNER_LANG_STORAGE_KEY, "en");

    const { initLearnerI18n, whenEnReady } = await import("../../src/learner/core/i18n");
    const instance = initLearnerI18n();

    expect(instance.language).toBe("en");

    await whenEnReady();
    expect(instance.t("common:actions.continue")).toBe(EN_VALUE);
  });
});

describe("learner i18n — whenEnReady", () => {
  beforeEach(() => {
    installLocalStorageMock();
    vi.resetModules();
  });

  afterEach(() => {
    window.localStorage.clear();
    cleanup();
  });

  it("resolves once all 17 en namespaces are registered, matching the real catalogs", async () => {
    const { initLearnerI18n, whenEnReady } = await import("../../src/learner/core/i18n");
    const instance = initLearnerI18n();

    await whenEnReady();

    expect(instance.getResourceBundle("en", "common")).toEqual(enCommon);
  });

  it("is idempotent — calling it multiple times returns the same settled promise", async () => {
    const { initLearnerI18n, whenEnReady } = await import("../../src/learner/core/i18n");
    initLearnerI18n();

    await Promise.all([whenEnReady(), whenEnReady(), whenEnReady()]);

    await expect(whenEnReady()).resolves.toBeUndefined();
  });

  it("lets an fr instance switch to en and resolve a translated string", async () => {
    const { initLearnerI18n, whenEnReady } = await import("../../src/learner/core/i18n");
    const instance = initLearnerI18n();
    expect(instance.language).toBe("fr");

    await whenEnReady();
    await instance.changeLanguage("en");

    expect(instance.t("common:actions.continue")).toBe(EN_VALUE);
  });

  it('heals a react-i18next consumer stranded by the unsafe order: changeLanguage("en") before whenEnReady() resolves still self-heals to the EN string once it lands', async () => {
    const { initLearnerI18n, whenEnReady } = await import("../../src/learner/core/i18n");
    const instance = initLearnerI18n();
    expect(instance.language).toBe("fr");

    // A real react-i18next consumer, bound directly to this instance (not
    // via LearnerI18nProvider/context) so the test exercises exactly the
    // subscription react-i18next's useTranslation() sets up: it listens for
    // the instance's 'languageChanged' event (default bindI18n), NOT the
    // store's 'added' event that addResourceBundle() emits.
    function Probe({ i18nInstance }: { readonly i18nInstance: I18nInstance }) {
      const { t } = useTranslation("common", { i18n: i18nInstance });
      return createElement("span", { "data-testid": "probe" }, t("actions.continue"));
    }

    render(createElement(Probe, { i18nInstance: instance }));

    // The unsafe order: switch to "en" before whenEnReady() has resolved.
    // changeLanguage() fires 'languageChanged' once as part of its own
    // flow, so react-i18next re-renders right away — but no en resources
    // are registered yet, so the rendered text is NOT the EN string.
    await act(async () => {
      await instance.changeLanguage("en");
    });
    expect(screen.getByTestId("probe").textContent).not.toBe(EN_VALUE);

    // EN lands. Nothing here re-renders <Probe/> directly — only the
    // `learnerI18n.emit("languageChanged", ...)` inside whenEnReady()
    // (src/learner/core/i18n/index.ts) does, by re-firing the event
    // react-i18next's useSyncExternalStore subscription actually listens
    // for. Delete that emit and this assertion times out: the rendered
    // text stays stuck on the pre-EN value forever, because
    // addResourceBundle's 'added' event has no react-i18next listener by
    // default (bindI18nStore: "").
    await act(async () => {
      await whenEnReady();
    });

    await waitFor(() => {
      expect(screen.getByTestId("probe").textContent).toBe(EN_VALUE);
    });
  });
});
