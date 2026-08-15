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
 * (`src/locales/{fr,en}/*.json`, 16 namespaces) and bundled statically via
 * eager imports — no runtime fetch, no i18next-http-backend. `notifications`
 * (S12) is the one exception: web push has no mobile counterpart, so that
 * catalog is authored here (French first, mirrored to English).
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

// en
import enApprendre from "../../locales/en/apprendre.json";
import enAuth from "../../locales/en/auth.json";
import enCoach from "../../locales/en/coach.json";
import enCommon from "../../locales/en/common.json";
import enDashboard from "../../locales/en/dashboard.json";
import enDrill from "../../locales/en/drill.json";
import enExam from "../../locales/en/exam.json";
import enExamen from "../../locales/en/examen.json";
import enNotifications from "../../locales/en/notifications.json";
import enOnboarding from "../../locales/en/onboarding.json";
import enProfil from "../../locales/en/profil.json";
import enSchreiben from "../../locales/en/schreiben.json";
import enSettings from "../../locales/en/settings.json";
import enSimulation from "../../locales/en/simulation.json";
import enSprechen from "../../locales/en/sprechen.json";
import enSrs from "../../locales/en/srs.json";
import enWriting from "../../locales/en/writing.json";

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
  en: {
    apprendre: enApprendre,
    auth: enAuth,
    coach: enCoach,
    common: enCommon,
    dashboard: enDashboard,
    drill: enDrill,
    exam: enExam,
    examen: enExamen,
    notifications: enNotifications,
    onboarding: enOnboarding,
    profil: enProfil,
    schreiben: enSchreiben,
    settings: enSettings,
    simulation: enSimulation,
    sprechen: enSprechen,
    srs: enSrs,
    writing: enWriting,
  },
} as const;

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
    // Resources are bundled statically (no backend, no async loading) —
    // initialize synchronously so `t()` is usable immediately after this
    // call returns, without awaiting the init promise. (i18next v22+
    // renamed this option from `initImmediate` to `initAsync`.)
    initAsync: false,
  });

  return learnerI18n;
}
