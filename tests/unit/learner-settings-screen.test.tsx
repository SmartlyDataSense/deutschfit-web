/**
 * `SettingsScreen` — S11 · Task 5.
 *
 * Beyond the brief's happy-path assertions, this suite pins every
 * invariant the screen owns so a future regression fails a NAMED test
 * rather than slipping through silently (S11 Task-5 brief mandate):
 *   - `hydrateExamContext()` is actually called on mount (not just that
 *     the store happens to be pre-populated by `setState`).
 *   - The analytics switch never writes anything — genuinely inert, not
 *     merely disabled-looking.
 *   - Every row's route target, not just its presence.
 *   - The about section renders live `getBackendInfo()` values, not
 *     hardcoded literals — proven by mocking the module and varying it.
 *   - The dev-only gallery row is present in dev and absent when
 *     `NODE_ENV` is not `"development"`.
 *   - No paywall / subscription copy anywhere (product lock).
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { BackendEnvName } from "@/learner/core/api/backendEnv";

const push = vi.fn();
const replace = vi.fn();
const back = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, back }),
  usePathname: () => "/fr/app/profil/settings",
}));
vi.mock("next-intl", () => ({ useLocale: () => "fr" }));

// Keep the real store but neuter the network/localStorage hydration the
// screen fires on mount (pattern: tests/unit/learner-drill-session-screen.test.tsx:31-37).
const { hydrateExamContextMock } = vi.hoisted(() => ({
  hydrateExamContextMock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/learner/core/exam/examContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/core/exam/examContext")>();
  return { ...actual, hydrateExamContext: hydrateExamContextMock };
});

const { getBackendInfoMock } = vi.hoisted(() => ({
  getBackendInfoMock: vi.fn(() => ({
    env: "dev" as BackendEnvName,
    projectRef: "ocqoqnifzlkrgcyjljpl" as string | null,
  })),
}));
vi.mock("@/learner/core/api/backendEnv", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/core/api/backendEnv")>();
  return { ...actual, getBackendInfo: getBackendInfoMock };
});

import { initLearnerI18n } from "@/learner/core/i18n";
import { LearnerI18nProvider } from "@/learner/core/i18n/LearnerI18nProvider";
import { LEARNER_LANG_STORAGE_KEY } from "@/learner/core/storage/flags";
import { SettingsScreen } from "@/learner/settings/screens/SettingsScreen";

function installStorageMock(): Map<string, string> {
  const store = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: () => null,
      get length() {
        return store.size;
      },
    },
  });
  return store;
}

afterEach(cleanup);
beforeAll(() => initLearnerI18n("fr"));
let store: Map<string, string>;
beforeEach(() => {
  push.mockReset();
  replace.mockReset();
  back.mockReset();
  hydrateExamContextMock.mockClear();
  getBackendInfoMock.mockClear();
  getBackendInfoMock.mockReturnValue({ env: "dev", projectRef: "ocqoqnifzlkrgcyjljpl" });
  store = installStorageMock();
});

const ui = () =>
  render(
    <LearnerI18nProvider lng="fr">
      <SettingsScreen />
    </LearnerI18nProvider>
  );

describe("SettingsScreen (S11.5)", () => {
  it("renders every section and the inert analytics switch", () => {
    ui();
    expect(screen.getByTestId("settings-language-fr")).toBeInTheDocument();
    expect(screen.getByTestId("settings-exam-row")).toBeInTheDocument();
    expect(screen.getByTestId("settings-exam-selector-row")).toBeInTheDocument();
    expect(screen.getByTestId("settings-objectives-row")).toBeInTheDocument();
    const optOut = screen.getByTestId("settings-analytics-optout-switch");
    expect(optOut).toBeDisabled();
    expect(screen.getByTestId("settings-delete-account-row")).toBeInTheDocument();
    expect(screen.getByTestId("settings-version-row")).toBeInTheDocument();
    expect(screen.getByTestId("settings-backend-env-row")).toBeInTheDocument();
    // No paywall / premium affordances, ever.
    expect(screen.queryByText(/Full Prep/i)).toBeNull();
    expect(screen.queryByText(/abonnement/i)).toBeNull();
  });

  it("calls hydrateExamContext on mount (S11 carry-in invariant)", () => {
    ui();
    expect(hydrateExamContextMock).toHaveBeenCalledTimes(1);
  });

  it("switching language persists the flag and swaps the URL locale prefix", () => {
    ui();
    fireEvent.click(screen.getByTestId("settings-language-en"));
    expect(store.get(LEARNER_LANG_STORAGE_KEY)).toBe("en");
    expect(replace).toHaveBeenCalledWith("/en/app/profil/settings");
  });

  it("clicking the active language is a no-op", () => {
    ui();
    fireEvent.click(screen.getByTestId("settings-language-fr"));
    expect(replace).not.toHaveBeenCalled();
    expect(store.get(LEARNER_LANG_STORAGE_KEY)).toBeUndefined();
  });

  it("the active language row is checked and the inactive one is not", () => {
    ui();
    expect(screen.getByTestId("settings-language-fr")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("settings-language-en")).toHaveAttribute("aria-checked", "false");
  });

  it("privacy and terms are links into /legal (S11-D8)", () => {
    ui();
    expect(screen.getByTestId("settings-privacy-row")).toHaveAttribute("href", "/fr/legal/privacy");
    expect(screen.getByTestId("settings-terms-row")).toHaveAttribute("href", "/fr/legal/tos");
  });

  it("routes: exam-track, exam-selector, objectives, delete", () => {
    ui();
    fireEvent.click(screen.getByTestId("settings-exam-row"));
    expect(push).toHaveBeenCalledWith("/fr/app/profil/settings/exam-track");
    fireEvent.click(screen.getByTestId("settings-exam-selector-row"));
    expect(push).toHaveBeenCalledWith("/fr/app/profil/settings/exam-selector");
    fireEvent.click(screen.getByTestId("settings-objectives-row"));
    expect(push).toHaveBeenCalledWith("/fr/app/profil/settings/objectives");
    fireEvent.click(screen.getByTestId("settings-delete-account-row"));
    expect(push).toHaveBeenCalledWith("/fr/app/profil/delete-account");
  });

  it("the analytics opt-out switch is genuinely inert: clicking it never writes a flag", () => {
    ui();
    const optOut = screen.getByTestId("settings-analytics-optout-switch");
    fireEvent.click(optOut);
    // Disabled inputs don't fire onClick handlers in the DOM, but assert
    // the behavioural contract directly: nothing was ever persisted.
    expect(store.size).toBe(0);
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("about section renders live getBackendInfo() values, not literals", () => {
    getBackendInfoMock.mockReturnValue({ env: "prod", projectRef: "auketecsgmdqlexosaay" });
    ui();
    expect(screen.getByTestId("settings-backend-ref-row")).toHaveTextContent("auketecsgmdqlexosaay");
    expect(screen.getByTestId("settings-backend-env-row")).toHaveTextContent(/Prod/i);
  });

  it("env row tints warning unless env is prod", () => {
    getBackendInfoMock.mockReturnValue({ env: "dev", projectRef: "ocqoqnifzlkrgcyjljpl" });
    const { unmount } = ui();
    const devRow = screen.getByTestId("settings-backend-env-row");
    expect(devRow.textContent).toMatch(/Dev/i);
    expect(devRow.querySelector("p, span")?.className).toMatch(/warning/);
    unmount();

    getBackendInfoMock.mockReturnValue({ env: "prod", projectRef: "auketecsgmdqlexosaay" });
    ui();
    const prodRow = screen.getByTestId("settings-backend-env-row");
    expect(prodRow.querySelector("p, span")?.className).not.toMatch(/warning/);
  });

  it("version row interpolates the real package.json version, not a hardcoded literal", async () => {
    ui();
    const pkg = await import("../../package.json");
    expect(screen.getByTestId("settings-version-row")).toHaveTextContent(pkg.version);
  });

  it("renders the dev-only gallery row in a development build", () => {
    const original = process.env.NODE_ENV;
    // @ts-expect-error -- test-only override of a readonly-in-types env var
    process.env.NODE_ENV = "development";
    try {
      ui();
      expect(screen.getByTestId("settings-dev-gallery-row")).toBeInTheDocument();
      fireEvent.click(screen.getByTestId("settings-dev-gallery-row"));
      expect(push).toHaveBeenCalledWith("/fr/app/dev/gallery");
    } finally {
      // @ts-expect-error -- restore
      process.env.NODE_ENV = original;
    }
  });

  it("hides the dev-only gallery row outside development (e.g. a production build)", () => {
    const original = process.env.NODE_ENV;
    // @ts-expect-error -- test-only override of a readonly-in-types env var
    process.env.NODE_ENV = "production";
    try {
      ui();
      expect(screen.queryByTestId("settings-dev-gallery-row")).toBeNull();
    } finally {
      // @ts-expect-error -- restore
      process.env.NODE_ENV = original;
    }
  });

  it("every user-visible label resolves via i18n, not a raw fallback key", () => {
    ui();
    // A missing/unresolved i18next key renders literally as the dotted
    // key string (e.g. "settings:title") — assert none of that leaks.
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/settings:[a-zA-Z.]+/);
    expect(text).not.toMatch(/profil:[a-zA-Z.]+/);
  });
});
