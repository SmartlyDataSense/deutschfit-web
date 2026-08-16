/**
 * Guardrail: the `en` locale catalogs must not contain French-only text.
 *
 * `defaultLocale` is `en` with `localePrefix: "always"`
 * (`src/i18n/routing.ts`), so a visitor whose browser doesn't negotiate to
 * `/fr` lands on `/en` and reads whatever is in that catalog — French
 * strings there are read by real users, not a theoretical concern.
 *
 * web#46 (`settings:analytics.comingSoon` / `settings:developer.comingSoon`)
 * and web#35 (`simulation:unsupportedDrill.*`) were both found by accident
 * during unrelated reviews, which is evidence the real count of leaked
 * French strings was unknown. A full sweep of every `en/*.json` file (task
 * 2 of the S14 defect burn-down) found more: the whole `coach:hub.*` block,
 * `dashboard:performanceHistory.feed.emptyCtaPill`,
 * `dashboard:comingSoon`, `settings:exam.levelComingSoon`, and
 * `sprechen:picker.bientot`. This test is the durable guard against the
 * class recurring.
 *
 * Detection strategy: scan every string leaf in every `en/*.json` file for
 * French-only markers —
 *   - French-specific orthography: é è ê à ç ù î ô, and the guillemets « »
 *   - a small closed list of French function words, matched as whole
 *     words only: le la les des du une aux pour avec sans dans est sont
 *
 * This is deliberately narrow. It must not fire on German exam vocabulary
 * that legitimately appears in English copy (Lesen, Hören, Schreiben,
 * Sprechen, Sprachbausteine, Übungen, Modelltest, Präsentation, …) or on
 * proper nouns (DeutschFit, Goethe, telc, Betreuer, Prüfer). None of the
 * marker characters/words appear in German orthography, so this is safe
 * by construction — verified below with a table of exactly those
 * candidates, in addition to the closed-list false-positive scan already
 * run over the real corpus while building this guard (see task-2-report.md
 * for the full manual sweep).
 *
 * One legitimate exception exists: `settings:language.fr` = "Français" is
 * the native name of the French language, shown in the language picker
 * regardless of UI locale (mirrored in `settings:language.en` = "English"
 * in the fr catalog). It contains "ç" and would otherwise false-positive.
 * It is allowlisted below, the same pattern used by
 * `learner-locales-no-certification.test.ts`'s `examBoards.*` allowlist.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, test } from "vitest";

const ACCENT_OR_GUILLEMET_RE = /[éèêàçùîôÉÈÊÀÇÙÎÔ«»]/;
// Closed list per the task brief. Known accepted trade-off: "pour", "sans",
// and "est" are also ordinary English words/abbreviations ("pour a drink",
// "sans serif", "est. 2024"), so a future English string using one of them
// would false-positive here. The current corpus was grep-swept clean of
// all thirteen words as whole-word matches outside the real French bugs
// this guard fixes (see task-2-report.md) — narrowing the list further
// wasn't necessary to get a clean, discriminating result today.
const FRENCH_FUNCTION_WORDS_RE = /\b(le|la|les|des|du|une|aux|pour|avec|sans|dans|est|sont)\b/i;

/**
 * Allowlist — flat `<namespace>:<dotted.key>` entries permitted to contain
 * a French marker. Each entry must justify its existence in the comment
 * above it.
 */
const ALLOWLIST = new Set<string>([
  // Native language name in the language picker — always "Français"
  // regardless of which locale is booted (mirrors "English" in fr).
  "settings:language.fr",
]);

const EN_LOCALES_DIR = path.resolve(__dirname, "../../src/learner/locales/en");

function flatten(obj: unknown, prefix: string, acc: Map<string, string>): void {
  if (obj === null || typeof obj !== "object") return;
  for (const [key, value] of Object.entries(obj)) {
    const next = prefix.length === 0 ? key : `${prefix}.${key}`;
    if (typeof value === "string") {
      acc.set(next, value);
    } else if (Array.isArray(value)) {
      value.forEach((entry, idx) => {
        if (typeof entry === "string") {
          acc.set(`${next}[${idx}]`, entry);
        } else {
          flatten(entry, `${next}[${idx}]`, acc);
        }
      });
    } else if (typeof value === "object") {
      flatten(value, next, acc);
    }
  }
}

function listEnCatalogFiles(): readonly string[] {
  return fs
    .readdirSync(EN_LOCALES_DIR, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith(".json"))
    .map((d) => path.join(EN_LOCALES_DIR, d.name));
}

function loadCatalog(filePath: string): Map<string, string> {
  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(raw) as unknown;
  const flat = new Map<string, string>();
  flatten(parsed, "", flat);
  return flat;
}

interface Violation {
  readonly key: string;
  readonly value: string;
  readonly reason: "accent-or-guillemet" | "function-word";
}

function findFrenchMarkers(value: string): Violation["reason"] | null {
  if (ACCENT_OR_GUILLEMET_RE.test(value)) return "accent-or-guillemet";
  if (FRENCH_FUNCTION_WORDS_RE.test(value)) return "function-word";
  return null;
}

describe("en locale catalogs · no leftover French text (web#46, web#35)", () => {
  const files = listEnCatalogFiles();

  test("swept more than 10 catalog files (sanity check the glob isn't silently matching nothing)", () => {
    // The S13 bundle-budget script shipped a guard that passed on zero
    // items precisely because it lacked this floor. Don't repeat it.
    expect(files.length).toBeGreaterThan(10);
  });

  test("every en/*.json catalog has zero French-only leaf values", () => {
    const violations: Violation[] = [];
    for (const filePath of files) {
      const ns = path.basename(filePath, ".json");
      const flat = loadCatalog(filePath);
      for (const [key, value] of flat) {
        const reason = findFrenchMarkers(value);
        if (!reason) continue;
        const fullKey = `${ns}:${key}`;
        if (ALLOWLIST.has(fullKey)) continue;
        violations.push({ key: fullKey, value, reason });
      }
    }
    if (violations.length > 0) {
      const detail = violations
        .map((v) => `  - ${v.key} [${v.reason}] = ${JSON.stringify(v.value)}`)
        .join("\n");
      throw new Error(
        `Found ${violations.length} French string(s) in the en locale catalogs:\n${detail}\n\n` +
          `Translate the value. If it legitimately must contain a French marker (e.g. a native ` +
          `language name), add its full key to ALLOWLIST in ` +
          `tests/unit/learner-locales-en-no-french.test.ts and explain why in the comment above the set.`
      );
    }
    expect(violations).toEqual([]);
  });

  test("allowlist entries are all real keys in an en catalog (no stale entries)", () => {
    const allKeys = new Set<string>();
    for (const filePath of files) {
      const ns = path.basename(filePath, ".json");
      for (const key of loadCatalog(filePath).keys()) {
        allKeys.add(`${ns}:${key}`);
      }
    }
    for (const entry of ALLOWLIST) {
      expect(allKeys.has(entry)).toBe(true);
    }
  });

  describe("discrimination — the walker fires on planted French, not on legitimate content", () => {
    test("fires on a planted French sentence (accent marker)", () => {
      expect(findFrenchMarkers("Bientôt disponible")).toBe("accent-or-guillemet");
    });

    test("fires on a planted French sentence using only function words (no accents)", () => {
      expect(findFrenchMarkers("C'est dans le catalogue")).toBe("function-word");
    });

    test("fires on guillemets alone", () => {
      expect(findFrenchMarkers("« Coming soon »")).toBe("accent-or-guillemet");
    });

    // False-positive candidates: legitimate English copy, proper nouns, and
    // German exam vocabulary that appears verbatim in English strings. None
    // of these may trip the walker — German umlauts (ä ö ü ß) are outside
    // the accent set by design, and none of the closed-list function words
    // occur as whole words inside them.
    test.each([
      ["plain English sentence", "Coming soon"],
      ["plain English sentence with punctuation", "What do you want to work on today?"],
      ["brand name", "DeutschFit"],
      ["persona name", "Betreuer"],
      ["persona name, alternate", "Prüfer"],
      ["exam board", "Goethe"],
      ["exam board, lowercase", "telc"],
      ["exam board", "ÖSD"],
      ["exam content term", "Modellsatz"],
      ["exam content term, plural", "Modelltests"],
      ["skill name", "Lesen"],
      ["skill name", "Hören"],
      ["skill name", "Schreiben"],
      ["skill name", "Sprechen"],
      ["skill name", "Sprachbausteine"],
      ["German noun with umlaut", "Übungen"],
      ["German noun with umlaut", "Präsentation"],
      ["English word that is a substring superset of a function word", "best connector"],
      ["interpolation-only value", "{{score}} / {{scoreMax}}"],
    ])("does not fire on %s (%j)", (_label, value) => {
      expect(findFrenchMarkers(value)).toBeNull();
    });
  });
});
