/**
 * `countWords` — German-friendly word counter for the writing composer.
 *
 * Ported verbatim from `deutschfit-mobile/src/core/util/wordCount.ts:15-20`
 * (task 6.3). Cases below are the brief's explicit list plus the umlaut/ß
 * and digit checks it calls out.
 */
import { describe, expect, it } from "vitest";

import { countWords } from "@/learner/core/util/wordCount";

describe("countWords", () => {
  it("empty string → 0", () => {
    expect(countWords("")).toBe(0);
  });

  it("hyphenated token counts as one word", () => {
    expect(countWords("e-mail")).toBe(1);
  });

  it("apostrophe token counts as one word", () => {
    expect(countWords("c'est")).toBe(1);
  });

  it("a lone dash surrounded by spaces carries no letters/digits → 0", () => {
    expect(countWords(" - ")).toBe(0);
  });

  it("punctuation-only string (guillemets, apostrophe, ellipsis) → 0", () => {
    expect(countWords("«'...»")).toBe(0);
  });

  it("umlauts and ß count as letters", () => {
    expect(countWords("Grüße Mädchen Straße")).toBe(3);
  });

  it("digits count as words", () => {
    expect(countWords("im Jahr 2026")).toBe(3);
  });

  it("collapses multi-space runs to single word boundaries", () => {
    expect(countWords("ein   zwei     drei")).toBe(3);
  });
});
