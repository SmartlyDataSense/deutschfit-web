/**
 * final-review I-2 (a11y) — pins the WCAG AA body-text contrast (>=4.5:1)
 * for the amber `warningSubtle`/`warningText` token pair, and pins the two
 * call sites that must route through the new `warningSubtle` Chip tone
 * rather than the red `warning` one.
 *
 * Background: #51 routed three sites through `Chip`'s `tone` prop. Two of
 * them — `FocusChips` and `BetreuerHubScreen`'s "À venir" badge — do NOT
 * use mobile's `Pill` at all; they hand-roll `tokens.warningSubtle` /
 * `tokens.warningText` (amber). Wiring them to `tone="warning"` (the
 * faithful `Pill` port, backed by `--color-warning-red-text`, the app-wide
 * form-validation-error / destructive-label RED) made an advisory read as
 * an error list and "coming soon" read as "broken". The fix adds a narrow
 * new tone rather than repainting `warning` — the same shape #51 used when
 * it added `successText` instead of repainting `success`.
 *
 * Two kinds of pin, both required (either alone passes vacuously) —
 * mirroring `cta-label-contrast.test.ts`:
 *
 *   1. Token-level — computes the ratio from the hex values actually
 *      declared in `globals.css` (parsed, not a number copied from a
 *      report) and asserts it clears 4.5:1, plus the exact measured value
 *      so a future token nudge that stays compliant is still noticed. A
 *      second assertion proves the computation itself is discriminating
 *      by running the identical formula on a genuinely low-contrast pair.
 *   2. Wiring-level — a compliant token nobody points at fixes nothing.
 *      Asserts `Chip`'s `warningSubtle` spec resolves to the amber
 *      surface/text pair, that `warning` is left UNTOUCHED as the red
 *      `Pill` port, and that both call sites ask for `warningSubtle`.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const GLOBALS_CSS_PATH = path.resolve(__dirname, "../../src/app/globals.css");
const CHIP_PATH = path.resolve(__dirname, "../../src/learner/ui/primitives/Chip.tsx");
const APP_TEXT_PATH = path.resolve(__dirname, "../../src/learner/ui/primitives/AppText.tsx");
const FOCUS_CHIPS_PATH = path.resolve(__dirname, "../../src/learner/ui/blocks/FocusChips.tsx");
const BETREUER_HUB_PATH = path.resolve(
  __dirname,
  "../../src/learner/coach/screens/BetreuerHubScreen.tsx"
);

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

describe("final-review I-2 — Chip warningSubtle tone", () => {
  const css = fs.readFileSync(GLOBALS_CSS_PATH, "utf-8");

  it("computes >= 4.5:1 (WCAG AA body text) from the declared token values", () => {
    const surface = readToken(css, "color-warning-subtle");
    const text = readToken(css, "color-warning-text");
    expect(contrastRatio(text, surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("measures 5.35:1 for warning-text on warning-subtle", () => {
    const surface = readToken(css, "color-warning-subtle");
    const text = readToken(css, "color-warning-text");
    expect(contrastRatio(text, surface)).toBeCloseTo(5.35, 2);
  });

  it("is a discriminating guard: a genuinely low-contrast pair fails the same assertion", () => {
    // Two near-white surfaces run through the identical formula — ~1.04:1.
    const surface = readToken(css, "color-warning-subtle");
    const card = readToken(css, "color-bg-card");
    expect(contrastRatio(surface, card)).toBeLessThan(4.5);
  });

  /** Slices one `TONE_SPECS` entry out of `Chip.tsx`, whether Prettier put
   *  it on one line or exploded it across several. */
  function toneSpec(src: string, tone: string): string {
    const start = src.indexOf(`\n  ${tone}: {`);
    if (start < 0) throw new Error(`TONE_SPECS.${tone} not found in Chip.tsx`);
    const end = src.indexOf("},", start);
    return src.slice(start, end);
  }

  it("declares the amber pair (not the red family) for the warningSubtle spec", () => {
    const spec = toneSpec(fs.readFileSync(CHIP_PATH, "utf-8"), "warningSubtle");
    expect(spec).toMatch(/bg:\s*"bg-warning-subtle"/);
    expect(spec).toMatch(/border:\s*"border-warning-text"/);
    expect(spec).toMatch(/textTone:\s*"warningText"/);
    expect(spec).not.toMatch(/warning-red/);
  });

  it("leaves the red `warning` tone untouched as the faithful Pill port", () => {
    const spec = toneSpec(fs.readFileSync(CHIP_PATH, "utf-8"), "warning");
    expect(spec).toMatch(/border:\s*"border-warning-red"/);
    expect(spec).toMatch(/bg:\s*"bg-bg-hero"/);
    expect(spec).toMatch(/textTone:\s*"warning"/);
  });

  it("AppText's warningText tone resolves to --color-warning-text, not the red one", () => {
    const src = fs.readFileSync(APP_TEXT_PATH, "utf-8");
    expect(src).toMatch(/^\s*warningText:\s*"text-warning-text",$/m);
    expect(src).toMatch(/^\s*warning:\s*"text-warning-red-text",$/m);
  });

  it("FocusChips asks for the amber tone, not the red one", () => {
    const src = fs.readFileSync(FOCUS_CHIPS_PATH, "utf-8");
    expect(src).toMatch(/<Chip[^>]*tone="warningSubtle"/s);
    expect(src).not.toMatch(/<Chip[^>]*tone="warning"[\s/>]/s);
  });

  it("BetreuerHubScreen's coming-soon badge asks for the amber tone, not the red one", () => {
    const src = fs.readFileSync(BETREUER_HUB_PATH, "utf-8");
    expect(src).toMatch(/tone=\{disabled\s*\?\s*"warningSubtle"\s*:\s*"success"\}/);
  });
});
