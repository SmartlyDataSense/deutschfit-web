import type { IconName } from "@/learner/core/icons";

/**
 * Nav model (Task 1.3) — pure, framework-free logic shared by `TabBar`,
 * `Sidebar`, and `LearnerNav`. Ports the 5-tab set from
 * `deutschfit-mobile/src/app/navigation.tsx`'s `MainTabs` component:
 * Accueil / Apprendre / Coach / Examen / Profil, same order, same icons
 * (custom sprite `home`/`practice`/`profile`; ionicons `sparkles-outline`
 * for Coach, `document-text-outline` for Examen), same label + a11y-label
 * i18n keys (`common:tabs.*` / `common:tabsA11y.*`), same tint contract
 * (Coach always teal; every other tab orange only while active).
 *
 * Kept dependency-free (no React, no Next.js router) so it's testable in
 * plain Vitest without rendering anything — see `tests/unit/learner-nav.test.ts`.
 */

export type NavTabId = "accueil" | "apprendre" | "coach" | "examen" | "profil";

/** Icon rendered via the custom DeutschFit sprite (`@/learner/core/icons`). */
export interface NavTabSpriteIcon {
  readonly kind: "sprite";
  readonly name: IconName;
}

/** Icon rendered via one of the two ported ionicons glyphs. */
export interface NavTabIonicon {
  readonly kind: "ionicon";
  readonly name: "sparklesOutline" | "documentTextOutline";
}

export type NavTabIcon = NavTabSpriteIcon | NavTabIonicon;

export interface NavTabSpec {
  readonly id: NavTabId;
  /** `common:` namespace key for the visible label. */
  readonly labelKey: `tabs.${NavTabId}`;
  /** `common:` namespace key for the accessible name (screen readers). */
  readonly a11yKey: `tabsA11y.${NavTabId}`;
  /** Appended to `/{locale}/app` to build the route. Empty string for Accueil. */
  readonly pathSuffix: "" | `/${NavTabId}`;
  readonly icon: NavTabIcon;
}

/** The 5-tab set, in mobile's `MainTabs` order. */
export const NAV_TABS: readonly NavTabSpec[] = [
  {
    id: "accueil",
    labelKey: "tabs.accueil",
    a11yKey: "tabsA11y.accueil",
    pathSuffix: "",
    icon: { kind: "sprite", name: "home" },
  },
  {
    id: "apprendre",
    labelKey: "tabs.apprendre",
    a11yKey: "tabsA11y.apprendre",
    pathSuffix: "/apprendre",
    icon: { kind: "sprite", name: "practice" },
  },
  {
    id: "coach",
    labelKey: "tabs.coach",
    a11yKey: "tabsA11y.coach",
    pathSuffix: "/coach",
    icon: { kind: "ionicon", name: "sparklesOutline" },
  },
  {
    id: "examen",
    labelKey: "tabs.examen",
    a11yKey: "tabsA11y.examen",
    pathSuffix: "/examen",
    icon: { kind: "ionicon", name: "documentTextOutline" },
  },
  {
    id: "profil",
    labelKey: "tabs.profil",
    a11yKey: "tabsA11y.profil",
    pathSuffix: "/profil",
    icon: { kind: "sprite", name: "profile" },
  },
];

/** Builds the locale-prefixed href for a tab, e.g. `("fr", apprendre) -> "/fr/app/apprendre"`. */
export function buildTabHref(locale: string, tab: NavTabSpec): string {
  return `/${locale}/app${tab.pathSuffix}`;
}

/**
 * Strips a leading `/{locale}` segment from a pathname, e.g.
 * `stripLocalePrefix("/fr/app/apprendre", "fr") -> "/app/apprendre"`.
 * A bare locale root collapses to `"/"` rather than `""` so callers never
 * have to special-case an empty string. Returns the pathname unchanged if
 * it doesn't start with the given locale (defensive — every route in this
 * app is locale-prefixed, but `usePathname()` is untyped).
 */
export function stripLocalePrefix(pathname: string, locale: string): string {
  const prefix = `/${locale}`;
  if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) {
    return pathname;
  }
  const rest = pathname.slice(prefix.length);
  return rest === "" ? "/" : rest;
}

/**
 * Resolves which tab (if any) is active for a given pathname + locale.
 *
 * Accueil (`/app`) is matched by exact equality only — it's a string
 * prefix of every other tab's route (`/app/apprendre`, `/app/coach`, …),
 * so a naive `startsWith("/app")` would wrongly light up Accueil on every
 * other tab. Every other tab matches its own route exactly OR any nested
 * route beneath it (`/app/apprendre/schreiben/new` still highlights
 * Apprendre), so deep-linked feature screens keep their parent tab lit.
 *
 * Returns `null` for routes outside the 5-tab set (`/app/login`,
 * `/app/dev/gallery`) — callers treat that as "no tab highlighted"
 * rather than falling back to a default.
 */
export function resolveActiveTabId(pathname: string, locale: string): NavTabId | null {
  const path = stripLocalePrefix(pathname, locale);

  if (path === "/app" || path === "/app/") {
    return "accueil";
  }

  for (const tab of NAV_TABS) {
    if (tab.id === "accueil") continue;
    const route = `/app${tab.pathSuffix}`;
    if (path === route || path.startsWith(`${route}/`)) {
      return tab.id;
    }
  }

  return null;
}

export interface NavTabTint {
  readonly textClass: string;
  readonly iconVar: string;
  readonly pillClass?: string;
}

/**
 * Resolves the tint (label text class, icon `color` CSS value, optional
 * active-pill background class) for a tab. Mirrors mobile's
 * `LiquidGlassTabBar` tint contract exactly: Coach stays teal in every
 * state; every other tab goes `nav-active` (orange) only while active,
 * `text-tertiary` (grey) otherwise. Reads the same CSS custom properties
 * `AppText`/Tailwind use (`--color-coach`, `--color-nav-active`,
 * `--color-text-tertiary`, see `src/app/globals.css`) — never a hex
 * literal.
 */
export function resolveTabTint(tabId: NavTabId, isActive: boolean): NavTabTint {
  if (tabId === "coach") {
    return {
      textClass: "text-coach",
      iconVar: "var(--color-coach)",
      ...(isActive ? { pillClass: "bg-coach/10" } : {}),
    };
  }

  if (isActive) {
    return {
      textClass: "text-nav-active",
      iconVar: "var(--color-nav-active)",
      pillClass: "bg-nav-active/10",
    };
  }

  return {
    textClass: "text-text-tertiary",
    iconVar: "var(--color-text-tertiary)",
  };
}
