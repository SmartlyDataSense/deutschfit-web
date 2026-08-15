/**
 * Guardrail: no certification-board branding leaks into the UI via i18n.
 *
 * Ported verbatim (assertion rules unchanged) from deutschfit-mobile's
 * `src/__tests__/no-certification-strings.test.ts` to run against the
 * byte-identical catalog copies at `src/learner/locales/**`. Only the
 * import/path resolution and file header differ from the mobile source.
 *
 * Issue F-3 (2026-05-04): the user-facing surface area of the app must not
 * mention exam-board names — "Goethe", "Telc", "ÖSD", "Zertifikat", or any
 * board-specific copy. Users only ever see CEFR levels (A1 / A2 / B1 / B2 /
 * C1 / C2). The DB still collects `user_profiles.exam_board` for analytics;
 * the UI just stops rendering it.
 *
 * This test scans every value in `src/learner/locales/{en,fr}/*.json` for
 * the forbidden tokens. It is intentionally narrow on the keys it allows:
 * the **only** legitimate render-time exception is the board picker on the
 * onboarding exam-type screen, which sources option labels from
 * `common.examBoards.*` and must keep them so users can actually pick a
 * track. Every other key has to be debranded.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, test } from "vitest";

const FORBIDDEN = /goethe|telc|ösd|oesd|zertifikat/i;

/**
 * Allowlist — flat dotted keys that are permitted to contain certification
 * names. Each entry must justify its existence:
 *   - `<ns>:examBoards.<board>` — the board picker option labels in the
 *     onboarding exam-type screen / settings exam-track modal subtitle.
 *     This is the one render-time exception called out in F-3.
 */
const ALLOWLIST = new Set<string>([
  "common:examBoards.goethe",
  "common:examBoards.telc",
  "common:examBoards.oesd",
  "common:examBoards.testdaf",
  "common:examBoards.ecl",
  "common:examBoards.pflege",
  "common:examBoards.beruf_tourismus",
]);

const LOCALES_DIR = path.resolve(__dirname, "../../src/learner/locales");

function flatten(obj: unknown, prefix: string, acc: Map<string, string>): void {
  if (obj === null || typeof obj !== "object") return;
  for (const [key, value] of Object.entries(obj)) {
    const next = prefix.length === 0 ? key : `${prefix}.${key}`;
    if (typeof value === "string") {
      acc.set(next, value);
    } else if (typeof value === "object" && value !== null) {
      flatten(value, next, acc);
    }
  }
}

function loadLocale(lang: string, ns: string): Map<string, string> {
  const file = path.join(LOCALES_DIR, lang, `${ns}.json`);
  const raw = fs.readFileSync(file, "utf-8");
  const parsed = JSON.parse(raw) as unknown;
  const flat = new Map<string, string>();
  flatten(parsed, "", flat);
  return flat;
}

function listLanguages(): readonly string[] {
  return fs
    .readdirSync(LOCALES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

function listNamespaces(lang: string): readonly string[] {
  return fs
    .readdirSync(path.join(LOCALES_DIR, lang))
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));
}

describe("F-3 guardrail · no certification names in i18n strings", () => {
  const languages = listLanguages();

  test.each(languages)("locale '%s' has no forbidden tokens", (lang) => {
    const violations: { key: string; value: string }[] = [];
    for (const ns of listNamespaces(lang)) {
      const flat = loadLocale(lang, ns);
      for (const [key, value] of flat) {
        if (!FORBIDDEN.test(value)) continue;
        const fullKey = `${ns}:${key}`;
        if (ALLOWLIST.has(fullKey)) continue;
        violations.push({ key: fullKey, value });
      }
    }
    if (violations.length > 0) {
      const detail = violations.map((v) => `  - ${v.key} = ${JSON.stringify(v.value)}`).join("\n");
      throw new Error(
        `Found ${violations.length} certification-name leak(s) in locale '${lang}':\n${detail}\n\nIf this string really must mention a board, add its full key (e.g. "common:examBoards.goethe") to the ALLOWLIST in tests/unit/learner-locales-no-certification.test.ts and explain why in the comment block above the set.`
      );
    }
  });

  test("allowlist only covers the board-picker namespace", () => {
    for (const key of ALLOWLIST) {
      expect(key.startsWith("common:examBoards.")).toBe(true);
    }
  });
});
