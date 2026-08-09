/**
 * Display formatting for a prompt's `exam_board` token.
 *
 * Verbatim port of `deutschfit-mobile/src/features/writing/
 * examBoardLabel.ts:13-49` (S6 Task 6.6) — no web deviation, the
 * formatting logic is UI-framework-agnostic.
 *
 * `writing_prompts.exam_board` is a hyphenated identifier authored by the
 * content pipeline — e.g. `goethe-b2`, `telc-c1-hochschule`. The UI shows
 * it as a human-readable label while respecting each board's official
 * nomenclature (telc is lower-case, ÖSD / TestDaF / ECL have fixed
 * casing). The function is board-agnostic: an unknown board token is
 * title-cased rather than special-cased, so new boards need no change.
 */

/** Official spelling per board key. Boards not listed fall back to title-case. */
const BOARD_NAMES: Readonly<Record<string, string>> = {
  goethe: "Goethe",
  telc: "telc",
  oesd: "ÖSD",
  testdaf: "TestDaF",
  ecl: "ECL",
};

/** CEFR level tokens — rendered upper-case (`b2` → `B2`). */
const LEVEL_TOKEN = /^[abc][12]$/;

function titleCase(token: string): string {
  if (token.length === 0) return token;
  return token.charAt(0).toUpperCase() + token.slice(1);
}

/**
 * Format a raw `exam_board` token for display.
 *
 *   `goethe-b2`            → `Goethe B2`
 *   `telc-c1-hochschule`   → `telc C1 Hochschule`
 *   `oesd-b1`              → `ÖSD B1`
 *
 * An empty or malformed input is returned unchanged.
 */
export function formatBoardLabel(raw: string): string {
  const tokens = raw.split("-").filter((segment) => segment.length > 0);
  if (tokens.length === 0) return raw;
  return tokens
    .map((token, index) => {
      const lower = token.toLowerCase();
      if (index === 0) return BOARD_NAMES[lower] ?? titleCase(token);
      if (LEVEL_TOKEN.test(lower)) return lower.toUpperCase();
      return titleCase(token);
    })
    .join(" ");
}
