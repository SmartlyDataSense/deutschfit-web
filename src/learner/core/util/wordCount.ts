/**
 * German-friendly word counter for the writing-slice composer.
 *
 * Ported verbatim from `deutschfit-mobile/src/core/util/wordCount.ts:15-20`
 * — same normalisation, same tokeniser, no web-specific changes.
 *
 * Normalisation:
 *   - Keep letters (incl. diacritics), digits, hyphens, and apostrophes.
 *   - Collapse everything else to a single space.
 *   - Trim; empty → 0; else split on whitespace runs.
 *   - A token only counts when it carries at least one letter or digit, so
 *     a stray dash or apostrophe used as punctuation (` - `, `« '... »`)
 *     never inflates the count over the backend's tokeniser.
 *
 * Rules cover the spec's hyphenated-token and apostrophe cases (e.g.
 * `e-mail` → 1, `c'est` → 1).
 */
export function countWords(text: string): number {
  const normalised = text.replace(/[^\p{L}\p{N}\-']+/gu, " ").trim();
  if (normalised.length === 0) return 0;
  return normalised.split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}
