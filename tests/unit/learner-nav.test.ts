import { describe, it, expect } from "vitest";

import {
  NAV_TABS,
  buildTabHref,
  resolveActiveTabId,
  resolveTabTint,
  stripLocalePrefix,
} from "@/learner/ui/nav/navModel";

describe("NAV_TABS", () => {
  it("declares exactly 5 tabs in mobile's MainTabs order (Accueil, Apprendre, Coach, Examen, Profil)", () => {
    expect(NAV_TABS.map((tab) => tab.id)).toEqual([
      "accueil",
      "apprendre",
      "coach",
      "examen",
      "profil",
    ]);
  });

  it("gives every tab a common:tabs.* label key and a common:tabsA11y.* a11y key", () => {
    for (const tab of NAV_TABS) {
      expect(tab.labelKey).toBe(`tabs.${tab.id}`);
      expect(tab.a11yKey).toBe(`tabsA11y.${tab.id}`);
    }
  });

  it("uses the custom sprite for Accueil/Apprendre/Profil and ionicons for Coach/Examen (mobile parity)", () => {
    const byId = Object.fromEntries(NAV_TABS.map((tab) => [tab.id, tab]));
    expect(byId.accueil?.icon).toEqual({ kind: "sprite", name: "home" });
    expect(byId.apprendre?.icon).toEqual({ kind: "sprite", name: "practice" });
    expect(byId.profil?.icon).toEqual({ kind: "sprite", name: "profile" });
    expect(byId.coach?.icon).toEqual({ kind: "ionicon", name: "sparklesOutline" });
    expect(byId.examen?.icon).toEqual({ kind: "ionicon", name: "documentTextOutline" });
  });
});

describe("buildTabHref", () => {
  it("builds the locale-prefixed href for Accueil (no suffix)", () => {
    const accueil = NAV_TABS[0]!;
    expect(buildTabHref("fr", accueil)).toBe("/fr/app");
    expect(buildTabHref("en", accueil)).toBe("/en/app");
  });

  it("builds the locale-prefixed href for every other tab", () => {
    const byId = Object.fromEntries(NAV_TABS.map((tab) => [tab.id, tab]));
    expect(buildTabHref("fr", byId.apprendre!)).toBe("/fr/app/apprendre");
    expect(buildTabHref("fr", byId.coach!)).toBe("/fr/app/coach");
    expect(buildTabHref("fr", byId.examen!)).toBe("/fr/app/examen");
    expect(buildTabHref("en", byId.profil!)).toBe("/en/app/profil");
  });
});

describe("stripLocalePrefix", () => {
  it("removes a leading /fr or /en segment", () => {
    expect(stripLocalePrefix("/fr/app/apprendre", "fr")).toBe("/app/apprendre");
    expect(stripLocalePrefix("/en/app", "en")).toBe("/app");
  });

  it("collapses a bare locale root to '/'", () => {
    expect(stripLocalePrefix("/fr", "fr")).toBe("/");
  });

  it("returns the pathname unchanged when it doesn't start with the given locale", () => {
    expect(stripLocalePrefix("/en/app", "fr")).toBe("/en/app");
  });
});

describe("resolveActiveTabId", () => {
  it("matches Accueil only on the exact /app root (with or without trailing slash)", () => {
    expect(resolveActiveTabId("/fr/app", "fr")).toBe("accueil");
    expect(resolveActiveTabId("/fr/app/", "fr")).toBe("accueil");
    expect(resolveActiveTabId("/en/app", "en")).toBe("accueil");
  });

  it("matches a tab's own route exactly", () => {
    expect(resolveActiveTabId("/fr/app/apprendre", "fr")).toBe("apprendre");
    expect(resolveActiveTabId("/fr/app/coach", "fr")).toBe("coach");
    expect(resolveActiveTabId("/fr/app/examen", "fr")).toBe("examen");
    expect(resolveActiveTabId("/fr/app/profil", "fr")).toBe("profil");
  });

  it("matches nested routes under a tab (deep-linked feature screens)", () => {
    expect(resolveActiveTabId("/fr/app/apprendre/schreiben/new", "fr")).toBe("apprendre");
    expect(resolveActiveTabId("/en/app/examen/modelltests/123", "en")).toBe("examen");
  });

  it("never lets a prefix collision leak Accueil into another tab's nested route", () => {
    // "/app" is a string-prefix of every other tab's path — the resolver
    // must not use naive startsWith("/app") for Accueil.
    expect(resolveActiveTabId("/fr/app/apprendre", "fr")).not.toBe("accueil");
  });

  it("returns null for routes outside the 5-tab set", () => {
    expect(resolveActiveTabId("/fr/app/login", "fr")).toBeNull();
    expect(resolveActiveTabId("/fr/app/dev/gallery", "fr")).toBeNull();
  });
});

describe("resolveTabTint", () => {
  it("keeps Coach teal whether active or not", () => {
    // S13 Task 10 (axe sweep): label text uses the AA-safe `-text` shade;
    // the icon var stays the vivid decorative teal (unaffected by axe's
    // text-only color-contrast rule).
    expect(resolveTabTint("coach", false)).toEqual({
      textClass: "text-coach-text",
      iconVar: "var(--color-coach)",
    });
    expect(resolveTabTint("coach", true)).toEqual({
      textClass: "text-coach-text",
      iconVar: "var(--color-coach)",
      pillClass: "bg-coach/10",
    });
  });

  it("tints every other tab orange (nav-active) only when active", () => {
    expect(resolveTabTint("accueil", true)).toEqual({
      textClass: "text-nav-active-text",
      iconVar: "var(--color-nav-active)",
      pillClass: "bg-nav-active/10",
    });
    expect(resolveTabTint("profil", false)).toEqual({
      textClass: "text-text-tertiary",
      iconVar: "var(--color-text-tertiary)",
    });
  });
});
