/**
 * Learner-app i18next instance.
 *
 * This is a dedicated, non-singleton i18next instance (`createInstance`)
 * scoped to the `/learner` surface. The marketing/admin surfaces in this
 * repo already run `next-intl` (see `src/i18n/`); using the global i18next
 * singleton here would collide with any future i18next usage elsewhere in
 * the app, so the learner app always talks to its own instance.
 *
 * Locale catalogs are copied verbatim from `deutschfit-mobile`
 * (`src/locales/{fr,en}/*.json`, 16 namespaces) — no runtime fetch, no
 * i18next-http-backend. `notifications` (S12) is the one exception: web
 * push has no mobile counterpart, so that catalog is authored here (French
 * first, mirrored to English).
 *
 * `fr` (the default boot language) is bundled statically via eager imports,
 * so `t()` resolves synchronously the instant `initLearnerI18n()` returns —
 * see `initAsync: false` below. `en` is a *fallback* locale, not the default:
 * its 17 catalogs are dynamically `import()`ed and registered via
 * `addResourceBundle()` in the background (`whenEnReady()`), kicked off
 * unconditionally at the end of init. This keeps ~21 kB gz of English JSON
 * out of every learner route's first-load bundle. Callers that need EN
 * resolved (an `/en/…` boot, or a component relying on the fr→en fallback)
 * must `await whenEnReady()` first.
 *
 * Language resolution order:
 *   1. `lngOverride` argument passed to `initLearnerI18n()` (e.g. from
 *      `LearnerI18nProvider`'s `lng` prop).
 *   2. `localStorage["@deutschfit/lang"]` if it holds a supported language.
 *   3. Default: `"fr"` (matches the mobile app's default — NOT the
 *      browser's `navigator.language`).
 *
 * `fallbackLng` is `"en"`: any key missing from the `fr` catalog resolves
 * to the `en` value instead of rendering the raw key.
 */
import i18next, { type i18n } from "i18next";
import { initReactI18next } from "react-i18next";

// fr
import frApprendre from "../../locales/fr/apprendre.json";
import frAuth from "../../locales/fr/auth.json";
import frCoach from "../../locales/fr/coach.json";
import frCommon from "../../locales/fr/common.json";
import frDashboard from "../../locales/fr/dashboard.json";
import frDrill from "../../locales/fr/drill.json";
import frExam from "../../locales/fr/exam.json";
import frExamen from "../../locales/fr/examen.json";
import frNotifications from "../../locales/fr/notifications.json";
import frOnboarding from "../../locales/fr/onboarding.json";
import frProfil from "../../locales/fr/profil.json";
import frSchreiben from "../../locales/fr/schreiben.json";
import frSettings from "../../locales/fr/settings.json";
import frSimulation from "../../locales/fr/simulation.json";
import frSprechen from "../../locales/fr/sprechen.json";
import frSrs from "../../locales/fr/srs.json";
import frWriting from "../../locales/fr/writing.json";

/** localStorage key the learner app reads/writes for the persisted language choice. */
export const LEARNER_LANG_STORAGE_KEY = "@deutschfit/lang";

/** Learner app default language — matches mobile; never derived from `navigator.language`. */
export const LEARNER_DEFAULT_LNG = "fr";

/** Fallback language for keys missing from the active catalog. */
export const LEARNER_FALLBACK_LNG = "en";

export const LEARNER_SUPPORTED_LNGS = ["fr", "en"] as const;
export type LearnerLng = (typeof LEARNER_SUPPORTED_LNGS)[number];

export const LEARNER_NAMESPACES = [
  "apprendre",
  "auth",
  "coach",
  "common",
  "dashboard",
  "drill",
  "exam",
  "examen",
  "notifications",
  "onboarding",
  "profil",
  "schreiben",
  "settings",
  "simulation",
  "sprechen",
  "srs",
  "writing",
] as const;

const resources = {
  fr: {
    apprendre: frApprendre,
    auth: frAuth,
    coach: frCoach,
    common: frCommon,
    dashboard: frDashboard,
    drill: frDrill,
    exam: frExam,
    examen: frExamen,
    notifications: frNotifications,
    onboarding: frOnboarding,
    profil: frProfil,
    schreiben: frSchreiben,
    settings: frSettings,
    simulation: frSimulation,
    sprechen: frSprechen,
    srs: frSrs,
    writing: frWriting,
  },
} as const;

/**
 * Dynamic loaders for the `en` fallback catalogs — one entry per
 * `LEARNER_NAMESPACES` member, alphabetical. Each is a code-split chunk;
 * none of these run until `whenEnReady()` is called.
 */
const EN_LOADERS: Record<(typeof LEARNER_NAMESPACES)[number], () => Promise<{ default: object }>> =
  {
    apprendre: () => import("../../locales/en/apprendre.json"),
    auth: () => import("../../locales/en/auth.json"),
    coach: () => import("../../locales/en/coach.json"),
    common: () => import("../../locales/en/common.json"),
    dashboard: () => import("../../locales/en/dashboard.json"),
    drill: () => import("../../locales/en/drill.json"),
    exam: () => import("../../locales/en/exam.json"),
    examen: () => import("../../locales/en/examen.json"),
    notifications: () => import("../../locales/en/notifications.json"),
    onboarding: () => import("../../locales/en/onboarding.json"),
    profil: () => import("../../locales/en/profil.json"),
    schreiben: () => import("../../locales/en/schreiben.json"),
    settings: () => import("../../locales/en/settings.json"),
    simulation: () => import("../../locales/en/simulation.json"),
    sprechen: () => import("../../locales/en/sprechen.json"),
    srs: () => import("../../locales/en/srs.json"),
    writing: () => import("../../locales/en/writing.json"),
  };

let enLoad: Promise<void> | null = null;

/**
 * Idempotent, lazy load of every `en` fallback catalog. The first call
 * kicks off all 17 dynamic imports in parallel and registers each via
 * `addResourceBundle`; every call (including concurrent ones) returns the
 * same settled promise. `initLearnerI18n()` calls this unconditionally at
 * the end of init, so EN normally lands in the background right after
 * hydration — callers only need to await it explicitly when they must be
 * certain EN is resolvable *now* (an `/en/…` boot, or a fr→en fallback that
 * must not flash a raw key).
 *
 * DO NOT remove the `learnerI18n.emit("languageChanged", ...)` below — it
 * looks like dead code but it is load-bearing. `react-i18next`'s
 * `useTranslation()` only re-renders a component in response to the
 * `'languageChanged'` event; by default (`bindI18nStore: ''`) it does NOT
 * subscribe to the store's `'added'` event that `addResourceBundle` emits.
 * So without this explicit emit, any component that rendered *before* this
 * promise resolved — either because a key was missing from `fr` and fell
 * through to a not-yet-loaded `en`, or because `changeLanguage("en")` was
 * called before this settled — is stuck showing the raw key forever: the
 * bundles land, but nothing tells react-i18next to re-render. Firing
 * `'languageChanged'` once here, at the single resolution point of the
 * shared promise (never inside the `.map`, never re-triggered by a repeat
 * call to `whenEnReady()` since `enLoad` is cached), heals every such
 * component in one pass.
 */
export function whenEnReady(): Promise<void> {
  enLoad ??= Promise.all(
    LEARNER_NAMESPACES.map(async (ns) => {
      const mod = await EN_LOADERS[ns]();
      learnerI18n.addResourceBundle("en", ns, mod.default, true, false);
    })
  ).then(() => {
    // Re-render every mounted useTranslation() consumer now that `en` is
    // fully registered — see the doc comment above for why this is
    // required and must not be deleted.
    learnerI18n.emit("languageChanged", learnerI18n.language);
  });
  return enLoad;
}

function isSupportedLng(value: string | null | undefined): value is LearnerLng {
  return value === "fr" || value === "en";
}

/**
 * Resolves the language to boot the instance with, per the module-level
 * resolution order (override → localStorage → "fr"). Never reads
 * `navigator.language` — the learner app always defaults to French
 * regardless of browser/OS locale, mirroring the mobile app.
 */
function resolveInitialLng(lngOverride?: string): LearnerLng {
  if (isSupportedLng(lngOverride)) return lngOverride;

  if (typeof window !== "undefined") {
    try {
      const stored = window.localStorage.getItem(LEARNER_LANG_STORAGE_KEY);
      if (isSupportedLng(stored)) return stored;
    } catch {
      // localStorage unavailable (SSR, privacy mode, disabled storage) — fall through to default.
    }
  }

  return LEARNER_DEFAULT_LNG;
}

/** Dedicated i18next instance for the learner app. Never the global i18next singleton. */
export const learnerI18n: i18n = i18next.createInstance();

let initPromise: Promise<unknown> | null = null;

/**
 * Idempotent init for `learnerI18n`. Safe to call from multiple components
 * (e.g. every render of `LearnerI18nProvider`) — the underlying
 * `i18next.init()` call only runs once. Passing `lngOverride` on a
 * subsequent call switches the already-initialized instance's language
 * instead of re-initializing.
 */
export function initLearnerI18n(lngOverride?: string): i18n {
  if (initPromise) {
    if (isSupportedLng(lngOverride) && learnerI18n.language !== lngOverride) {
      void learnerI18n.changeLanguage(lngOverride);
    }
    return learnerI18n;
  }

  initPromise = learnerI18n.use(initReactI18next).init({
    resources,
    lng: resolveInitialLng(lngOverride),
    fallbackLng: LEARNER_FALLBACK_LNG,
    defaultNS: "common",
    ns: LEARNER_NAMESPACES,
    interpolation: { escapeValue: false },
    // `fr` resources are bundled statically (no backend, no async loading)
    // — initialize synchronously so `t()` is usable immediately after this
    // call returns, without awaiting the init promise. (i18next v22+
    // renamed this option from `initImmediate` to `initAsync`.) This
    // guarantee is FR-only: `en` is not in `resources` above and is not
    // registered until `whenEnReady()` resolves — see the kick-off below.
    initAsync: false,
  });

  // Kick off the background EN load unconditionally, regardless of the
  // resolved boot language. This way a later `changeLanguage("en")` or a
  // fr→en key fallback finds the catalogs already loaded rather than
  // triggering a fresh (and slower) load on demand.
  void whenEnReady();

  return learnerI18n;
}
