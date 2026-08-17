/**
 * #50 (a11y) — pins the WCAG AA body-text contrast (>=4.5:1) for
 * `--color-cta-label`, the learner-scoped token that replaced `inverse`
 * (-> `--color-on-premium`, cream) as the label color for `AppButton`'s
 * solid variant and `Chip`'s selected state on top of `bg-cta`.
 *
 * Two kinds of pin, both required (either alone passes vacuously):
 *
 *   1. Token-level — computes the ratio from the hex values actually
 *      declared in `globals.css` (parsed, not a number copied from a
 *      report) and asserts it clears 4.5:1. A second assertion proves
 *      the computation itself is discriminating: the token this
 *      replaced (`--color-on-premium`, measured 2.87:1) still fails the
 *      same assertion when run through the identical formula.
 *   2. Wiring-level — a compliant token nobody points at fixes nothing.
 *      Asserts `AppButton`'s solid variant and `Chip`'s selected state
 *      actually route their label tone through `"ctaLabel"`, not
 *      `"inverse"`.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const GLOBALS_CSS_PATH = path.resolve(__dirname, "../../src/app/globals.css");
const APP_BUTTON_PATH = path.resolve(__dirname, "../../src/learner/ui/primitives/AppButton.tsx");
const CHIP_PATH = path.resolve(__dirname, "../../src/learner/ui/primitives/Chip.tsx");

function readToken(css: string, name: string): string {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`));
  if (!m) throw new Error(`token --${name} not found in globals.css`);
  return m[1]!;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function relLuminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(fg: string, bg: string): number {
  const lf = relLuminance(hexToRgb(fg));
  const lb = relLuminance(hexToRgb(bg));
  const [L1, L2] = lf > lb ? [lf, lb] : [lb, lf];
  return (L1 + 0.05) / (L2 + 0.05);
}

describe("#50 — cta-label token contrast", () => {
  const css = fs.readFileSync(GLOBALS_CSS_PATH, "utf-8");

  it("computes >= 4.5:1 (WCAG AA body text) from the declared token values", () => {
    const cta = readToken(css, "color-cta");
    const ctaLabel = readToken(css, "color-cta-label");
    expect(contrastRatio(ctaLabel, cta)).toBeGreaterThanOrEqual(4.5);
  });

  it("is a discriminating guard: the token cta-label replaced still fails the same assertion", () => {
    const cta = readToken(css, "color-cta");
    const onPremium = readToken(css, "color-on-premium");
    expect(contrastRatio(onPremium, cta)).toBeLessThan(4.5);
  });

  it("AppButton's solid variant routes its label through ctaLabel, not inverse", () => {
    const src = fs.readFileSync(APP_BUTTON_PATH, "utf-8");
    const solidBlock = src.slice(src.indexOf("solid: {"), src.indexOf("outline: {"));
    expect(solidBlock).toMatch(/toneIdle:\s*"ctaLabel"/);
  });

  it("Chip's selected state routes its label through ctaLabel, not inverse", () => {
    const src = fs.readFileSync(CHIP_PATH, "utf-8");
    expect(src).toMatch(/tone=\{selected \? "ctaLabel" : /);
  });
});
