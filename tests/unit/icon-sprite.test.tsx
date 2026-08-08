import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { Icon } from "@/learner/core/icons/Icon";
import { ICON_NAMES } from "@/learner/core/icons/iconSprite";
import {
  chatbubbleOutline,
  bulbOutline,
  micOutline,
  sparklesOutline,
  documentTextOutline,
} from "@/learner/core/icons/ionicons";

// Verbatim from repos/deutschfit-mobile/src/core/ui/iconSprite.ts — the
// canonical `IconName` union. This list is duplicated here (not imported)
// so the test fails if the web port drifts from the mobile source, rather
// than trivially passing by importing the same constant.
const MOBILE_ICON_NAMES = [
  "home",
  "practice",
  "betreuer",
  "exam",
  "profile",
  "schreiben",
  "sprechen",
  "lesen",
  "hoeren",
  "discuter",
  "target-focus",
  "review",
  "headset",
  "back",
  "chevron",
  "arrow-right",
  "search",
  "check",
  "close",
] as const;

describe("ICON_NAMES", () => {
  it("matches mobile's iconSprite.ts name set exactly", () => {
    expect(new Set(ICON_NAMES)).toEqual(new Set(MOBILE_ICON_NAMES));
    expect(ICON_NAMES.length).toBe(MOBILE_ICON_NAMES.length);
  });
});

describe("Icon", () => {
  it("renders a 24x24 svg with stroke=currentColor", () => {
    const html = renderToStaticMarkup(<Icon name="home" />);
    expect(html).toContain('viewBox="0 0 24 24"');
    expect(html).toContain('stroke="currentColor"');
  });

  it("emits the mobile 'home' icon's first path d value verbatim", () => {
    // repos/deutschfit-mobile/src/core/ui/iconSprite.ts → home: lines([
    //   "M3.5 11 L12 4 L20.5 11", ... ])
    const html = renderToStaticMarkup(<Icon name="home" />);
    expect(html).toContain("M3.5 11 L12 4 L20.5 11");
  });

  it("renders every mobile icon name without throwing", () => {
    for (const name of ICON_NAMES) {
      expect(() => renderToStaticMarkup(<Icon name={name} />)).not.toThrow();
    }
  });

  it("applies an accessible label when provided, and hides decoratively otherwise", () => {
    const labelled = renderToStaticMarkup(<Icon name="close" label="Fermer" />);
    expect(labelled).toContain('role="img"');
    expect(labelled).toContain('aria-label="Fermer"');

    const decorative = renderToStaticMarkup(<Icon name="close" />);
    expect(decorative).toContain('aria-hidden="true"');
  });
});

describe("ionicons", () => {
  const glyphs: Array<
    [string, (props: { size?: number; color?: string; label?: string }) => ReactElement]
  > = [
    ["chatbubbleOutline", chatbubbleOutline],
    ["bulbOutline", bulbOutline],
    ["micOutline", micOutline],
    ["sparklesOutline", sparklesOutline],
    ["documentTextOutline", documentTextOutline],
  ];

  it.each(glyphs)("%s renders a path element", (_name, Glyph) => {
    const html = renderToStaticMarkup(<Glyph />);
    expect(html).toContain("<path");
    expect(html).toContain('viewBox="0 0 512 512"');
  });
});
