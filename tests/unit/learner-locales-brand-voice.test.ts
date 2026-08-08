/**
 * Brand-voice lint test — ported verbatim (assertion rules unchanged) from
 * deutschfit-mobile's `src/locales/__tests__/brandVoice.lint.test.ts` to
 * run against the byte-identical catalog copies at
 * `src/learner/locales/**`. Only the import paths and file header differ
 * from the mobile source; do not "improve" the forbidden-token list here —
 * change it upstream in mobile first, then re-port.
 *
 * Walks every string value in the listed locale bundles and asserts that
 * none of the forbidden tokens listed in
 * `../../../deutschfit-meta/docs/product/brand-voice.md` appear in any
 * user-facing string.
 *
 * Forbidden categories enforced here:
 *   - wrong-relationship register: coach, entraîneur, prof, professeur,
 *     tuteur, assistant
 *   - stale persona name: Klara (retired — the Betreuer is unnamed)
 *   - gamification register: streak, série de, XP, quête, mission,
 *     challenge, combo
 *   - hype register: incroyable, génial, fantastique, boost, "let's go",
 *     "c'est parti", "on y va"
 *   - hype emoji: 🔥 ⚡ 🚀 🎯 🏆 🥇 🎖 🎉 🎊 🥳 💪 🦾 😊 😎 🤩 💎 ✨ 🌟 ❤️ 💜 🧡
 *   - exclamation marks (any value containing `!`)
 *
 * The walker is exported so future PRs can extend coverage to other
 * namespaces (writing, examen, coach, …) by calling
 * `collectStringValues(jsonObject)` and asserting the same pairs.
 *
 * Allowed exceptions:
 *   - the literal German words `Betreuer` and `Prüfer` (never matched).
 *   - i18next pluralization keys (`*_one` / `*_other`) — values with
 *     these keys are still walked, but the key names themselves are not
 *     used to match forbidden words.
 */
import { describe, expect, test } from "vitest";
import frSprechen from "../../src/learner/locales/fr/sprechen.json";
import enSprechen from "../../src/learner/locales/en/sprechen.json";
import frDashboard from "../../src/learner/locales/fr/dashboard.json";
import enDashboard from "../../src/learner/locales/en/dashboard.json";
import frProfil from "../../src/learner/locales/fr/profil.json";
import enProfil from "../../src/learner/locales/en/profil.json";
import frSchreiben from "../../src/learner/locales/fr/schreiben.json";
import enSchreiben from "../../src/learner/locales/en/schreiben.json";
import frCommon from "../../src/learner/locales/fr/common.json";
import enCommon from "../../src/learner/locales/en/common.json";

/**
 * Recursively walks any JSON-shaped value and yields every string leaf
 * value paired with the dotted path to it. Arrays are walked by index.
 */
export function collectStringValues(
  input: unknown,
  prefix = "",
): { readonly path: string; readonly value: string }[] {
  const out: { path: string; value: string }[] = [];
  if (typeof input === "string") {
    out.push({ path: prefix || "<root>", value: input });
    return out;
  }
  if (Array.isArray(input)) {
    input.forEach((entry, idx) => {
      out.push(
        ...collectStringValues(
          entry,
          prefix ? `${prefix}[${idx}]` : `[${idx}]`,
        ),
      );
    });
    return out;
  }
  if (input !== null && typeof input === "object") {
    for (const [key, value] of Object.entries(input)) {
      const nextPrefix = prefix ? `${prefix}.${key}` : key;
      out.push(...collectStringValues(value, nextPrefix));
    }
  }
  return out;
}

/**
 * Forbidden token spec. Each entry is a (label, regex) pair. The regex
 * runs against each string value as-is. Word-boundary anchors (`\b`)
 * are used wherever a substring could legitimately appear inside an
 * unrelated word (e.g. `mission` inside `permission_denied`).
 */
const FORBIDDEN_TOKENS: readonly { label: string; pattern: RegExp }[] = [
  // Wrong-relationship register.
  { label: "coach", pattern: /\bcoach(es|ing|ed)?\b/i },
  { label: "entraîneur / entraineur", pattern: /\bentra[iî]neur\b/i },
  // Gym register — the noun only (brand-voice §4). Verb forms like
  // « t'entraîner » are not on the forbidden list and must not match.
  { label: "entraînement / entrainement", pattern: /\bentra[iî]nements?\b/i },
  { label: "prof", pattern: /\bprof\b/i },
  { label: "professeur", pattern: /\bprofesseur\b/i },
  { label: "tuteur", pattern: /\btuteur\b/i },
  { label: "assistant (in-app forbidden)", pattern: /\bassistant\b/i },

  // Stale persona name — the Betreuer is unnamed (Klara was retired).
  { label: "Klara (retired persona)", pattern: /\bklara\b/i },

  // Gamification register.
  { label: "streak", pattern: /\bstreak\b/i },
  { label: "série (gamification)", pattern: /\bs[ée]rie\b/i },
  { label: "XP", pattern: /\bxp\b/i },
  { label: "quête", pattern: /\bqu[êe]te\b/i },
  { label: "mission", pattern: /\bmission\b/i },
  { label: "challenge", pattern: /\bchallenge\b/i },
  { label: "combo", pattern: /\bcombo\b/i },

  // Hype register.
  { label: "incroyable", pattern: /\bincroyable\b/i },
  { label: "génial", pattern: /\bg[ée]nial\b/i },
  { label: "fantastique", pattern: /\bfantastique\b/i },
  { label: "boost", pattern: /\bboost\b/i },
  { label: "let's go", pattern: /let[''‘’]s\s+go/i },
  { label: "c'est parti", pattern: /c[''‘’]est\s+parti/i },
  { label: "on y va", pattern: /\bon\s+y\s+va\b/i },

  // Hype emoji set (brand-voice §6 forbidden list).
  { label: "emoji 🔥", pattern: /🔥/u },
  { label: "emoji ⚡", pattern: /⚡/u },
  { label: "emoji 🚀", pattern: /🚀/u },
  { label: "emoji 🎯", pattern: /🎯/u },
  { label: "emoji 🏆", pattern: /🏆/u },
  { label: "emoji 🥇", pattern: /🥇/u },
  { label: "emoji 🎖", pattern: /🎖/u },
  { label: "emoji 🎉", pattern: /🎉/u },
  { label: "emoji 🎊", pattern: /🎊/u },
  { label: "emoji 🥳", pattern: /🥳/u },
  { label: "emoji 💪", pattern: /💪/u },
  { label: "emoji 🦾", pattern: /🦾/u },
  { label: "emoji 😊", pattern: /😊/u },
  { label: "emoji 😎", pattern: /😎/u },
  { label: "emoji 🤩", pattern: /🤩/u },
  { label: "emoji 💎", pattern: /💎/u },
  { label: "emoji ✨", pattern: /✨/u },
  { label: "emoji 🌟", pattern: /🌟/u },
  { label: "emoji ❤️", pattern: /❤️/u },
  { label: "emoji 💜", pattern: /💜/u },
  { label: "emoji 🧡", pattern: /🧡/u },

  // Exclamation marks — never in-app (brand-voice §7).
  { label: "exclamation mark (!)", pattern: /!/ },
];

interface Violation {
  readonly path: string;
  readonly value: string;
  readonly label: string;
}

function findViolations(
  resource: unknown,
  locale: string,
): readonly Violation[] {
  const violations: Violation[] = [];
  const entries = collectStringValues(resource);
  for (const { path, value } of entries) {
    for (const { label, pattern } of FORBIDDEN_TOKENS) {
      if (pattern.test(value)) {
        violations.push({
          path: `${locale}:${path}`,
          value,
          label,
        });
      }
    }
  }
  return violations;
}

describe("brand-voice lint — sprechen namespace", () => {
  test("collectStringValues walks objects, arrays, and primitives", () => {
    const sample = {
      a: "x",
      nested: { b: "y", arr: ["z1", { c: "z2" }] },
    };
    const collected = collectStringValues(sample).map(({ path, value }) => [
      path,
      value,
    ]);
    expect(collected).toEqual(
      expect.arrayContaining([
        ["a", "x"],
        ["nested.b", "y"],
        ["nested.arr[0]", "z1"],
        ["nested.arr[1].c", "z2"],
      ]),
    );
    expect(collected).toHaveLength(4);
  });

  test("fr/sprechen.json has zero forbidden-token violations", () => {
    const violations = findViolations(frSprechen, "fr/sprechen");
    if (violations.length > 0) {
      // Pretty-printed for the assert message.
      const detail = violations
        .map((v) => `  - ${v.path} [${v.label}]: ${JSON.stringify(v.value)}`)
        .join("\n");
      throw new Error(`Brand-voice violations in fr/sprechen.json:\n${detail}`);
    }
    expect(violations).toEqual([]);
  });

  test("en/sprechen.json has zero forbidden-token violations", () => {
    const violations = findViolations(enSprechen, "en/sprechen");
    if (violations.length > 0) {
      const detail = violations
        .map((v) => `  - ${v.path} [${v.label}]: ${JSON.stringify(v.value)}`)
        .join("\n");
      throw new Error(`Brand-voice violations in en/sprechen.json:\n${detail}`);
    }
    expect(violations).toEqual([]);
  });

  test("the walker itself catches a planted violation (regression guard)", () => {
    const planted = { ok: "Bilan prêt.", bad: "C'est parti !" };
    const violations = findViolations(planted, "test");
    const labels = violations.map((v) => v.label);
    expect(labels).toEqual(
      expect.arrayContaining(["c'est parti", "exclamation mark (!)"]),
    );
  });
});

/**
 * Extended lint coverage — runs the same forbidden-token walker over
 * the bundles that grew alongside the Sprechen v2 ship: Dashboard
 * (performance-history feed, hero teasers), Profil (account + exam
 * change flows), Schreiben (editor + handwritten path), and Common
 * (shared strings incl. exam result surfaces). The set matches the
 * brand-voice §11 surfaces explicitly named in the PR spec — "every
 * dashboard / profile / schreiben / common string passes the persona +
 * register locks before the v2 bilan ships."
 *
 * One test per locale-namespace pair. Failures pretty-print every
 * offending path so the developer can fix copy without re-running.
 */
describe.each([
  ["fr/dashboard.json", frDashboard],
  ["en/dashboard.json", enDashboard],
  ["fr/profil.json", frProfil],
  ["en/profil.json", enProfil],
  ["fr/schreiben.json", frSchreiben],
  ["en/schreiben.json", enSchreiben],
  ["fr/common.json", frCommon],
  ["en/common.json", enCommon],
])("brand-voice lint — %s", (label, resource) => {
  test(`${label} has zero forbidden-token violations`, () => {
    const violations = findViolations(resource, label);
    if (violations.length > 0) {
      const detail = violations
        .map((v) => `  - ${v.path} [${v.label}]: ${JSON.stringify(v.value)}`)
        .join("\n");
      throw new Error(`Brand-voice violations in ${label}:\n${detail}`);
    }
    expect(violations).toEqual([]);
  });
});
