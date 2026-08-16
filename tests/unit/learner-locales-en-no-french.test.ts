/**
 * Guardrail: the `en` locale catalogs must not contain leftover French (or
 * other untranslated-source-language) text.
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
 * `dashboard:comingSoon`, `settings:exam.levelComingSoon`,
 * `sprechen:picker.bientot`, and (German, same family, found in fix-round 1
 * of this task) `sprechen:feedbackScreen.rejected.tooShort.title`. This
 * suite is the durable guard against the class recurring.
 *
 * Two independent detectors run here:
 *
 * 1. LINGUISTIC — scans every string leaf in every `en/*.json` file for
 *    French-only markers: French-specific orthography (é è ê à ç ù î ô,
 *    guillemets « »), plus a small closed list of French function words
 *    matched as whole words (le la les des du une aux pour avec sans dans
 *    est sont). Fast and precise, but narrow: fix-round 1 found (via
 *    manual en/fr diff, not this detector) that `coach:hub.titleLead` =
 *    "Que veux-tu", `hub.titleAccent` = "travailler", and `hub.titleTrail`
 *    = "aujourd'hui ?" contain neither an accent/guillemet nor a
 *    closed-list function word, so this detector alone would have missed
 *    them. A reviewer confirmed the gap generalizes by injecting "Que
 *    veux-tu", "Disponible", "Continuer", and a control "Bientôt
 *    disponible" into `en/common.json`: only the accented control was
 *    caught (1 of 4).
 *
 * 2. STRUCTURAL — an `en` leaf value that is byte-identical to its `fr`
 *    counterpart at the same key is a candidate untranslated clone. This
 *    catches the linguistic detector's blind spot (short, accent-free,
 *    function-word-free French — and would catch German or any other
 *    language left in `en` too, since it doesn't care what language the
 *    leftover text is in). It fires on all three of the reviewer's
 *    injection strings ("Que veux-tu", "Disponible", "Continuer" — none of
 *    which contain a space+12-char signature, so a length/space threshold
 *    was tried and rejected; see the code comment on
 *    `isByteIdenticalToFr`). It is comprehensively allowlisted below: of
 *    150 `en`/`fr` leaf pairs that are byte-identical in today's
 *    catalogs, every one is either German exam vocabulary, a proper noun,
 *    an interpolation-placeholder/symbol-only value, a cognate spelled
 *    identically in both languages, or one of four individually-justified
 *    special cases — nothing is allowlisted "because it currently passes."
 *    A handful of entries are flagged as known non-French defects
 *    (tracked, not fixed by this guard) rather than declared legitimate;
 *    see KNOWN_DEBT_KEYS below and task-2-report.md.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, test } from "vitest";

// ============================================================================
// Detector 1: linguistic (French-marker) scan
// ============================================================================

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
 * Allowlist for detector 1 — flat `<namespace>:<dotted.key>` entries
 * permitted to contain a French marker. Each entry must justify its
 * existence in the comment above it.
 */
const LINGUISTIC_ALLOWLIST = new Set<string>([
  // Native language name in the language picker — always "Français"
  // regardless of which locale is booted (mirrors "English" in fr).
  "settings:language.fr",
]);

interface LinguisticViolation {
  readonly key: string;
  readonly value: string;
  readonly reason: "accent-or-guillemet" | "function-word";
}

function findFrenchMarkers(value: string): LinguisticViolation["reason"] | null {
  if (ACCENT_OR_GUILLEMET_RE.test(value)) return "accent-or-guillemet";
  if (FRENCH_FUNCTION_WORDS_RE.test(value)) return "function-word";
  return null;
}

// ============================================================================
// Detector 2: structural (byte-identical-to-fr) scan
// ============================================================================

/**
 * `isByteIdenticalToFr` has no length or space threshold — it flags every
 * exact match, full stop. A `space && length >= 12` filter was measured
 * during design (it narrows 150 identical pairs down to 34 "obviously
 * prose" candidates) but was rejected as the *trigger* condition: the
 * reviewer's injection strings "Disponible" (10 chars, no space) and
 * "Continuer" (9 chars, no space) both fail that filter, and the whole
 * point of this detector is to catch short, structure-free leftovers the
 * linguistic detector misses. The filtered view is still useful — it's
 * how the allowlist below was triaged — but the shipped rule is unfiltered
 * equality plus an exhaustive allowlist.
 */
function isByteIdenticalToFr(enValue: string, frValue: string): boolean {
  return enValue === frValue;
}

/**
 * Allowlist for detector 2 — every `en`/`fr` leaf pair that is legitimately
 * byte-identical, grouped by why. Each group states its justification once;
 * every key in it shares that justification. `KNOWN_DEBT_KEYS` is the one
 * group that is *not* a justification — it is an explicit list of matches
 * that are real (non-French) defects, deliberately not fixed by this task,
 * so the guard stays green without pretending they're fine. See
 * task-2-report.md for the reasoning behind each.
 */
const GERMAN_EXAM_VOCAB_KEYS: readonly string[] = [
  "apprendre:cards.hoeren.title",
  "apprendre:cards.lesen.title",
  "apprendre:cards.schreiben.title",
  "apprendre:cards.sprachbausteine.title",
  "apprendre:cards.sprechen.title",
  "apprendre:practice.hubTitle",
  "apprendre:practice.picker.setLabel",
  "apprendre:practice.rows.hoeren",
  "apprendre:practice.rows.lesen",
  "apprendre:practice.rows.schreiben",
  "apprendre:practice.rows.sprachbausteine",
  "apprendre:practice.rows.sprechen",
  "apprendre:practice.session.teilChip",
  "coach:chat.scripted.observation.connectors[0]",
  "coach:chat.scripted.observation.connectors[1]",
  "coach:chat.scripted.observation.connectors[2]",
  "coach:chat.scripted.observation.connectors[3]",
  "dashboard:performanceHistory.kind.schreiben",
  "dashboard:performanceHistory.kind.sprechen",
  "examen:cards.hoeren.title",
  "examen:cards.lesen.title",
  "examen:modelltests.title",
  "onboarding:diagnostic.section.lesen",
  "onboarding:diagnostic.section.sprachbausteine",
  "onboarding:diagnostic.section.wortschatz",
  "schreiben:editor.overline",
  "schreiben:editor.overlineFallback",
  "schreiben:editor.skill",
  "schreiben:editor.taskOverline",
  "schreiben:handwritten.review.rubric.erfuellung",
  "schreiben:handwritten.review.rubric.kohaerenz",
  "schreiben:handwritten.review.rubric.strukturen",
  "schreiben:handwritten.review.rubric.wortschatz",
  "simulation:footer.submit",
  "sprechen:customTopic.tasks.praesentation",
  "sprechen:customTopic.tasks.referat",
  "sprechen:customTopic.tasks.vortrag",
  "sprechen:feedbackScreen.monologueType.monologue_personal",
  "sprechen:feedbackScreen.monologueType.partner_summary_followup",
  "sprechen:feedbackScreen.monologueType.picture_description_collage_thematic",
  "sprechen:feedbackScreen.monologueType.picture_description_simple",
  "sprechen:feedbackScreen.monologueType.presentation_with_outline",
  "sprechen:feedbackScreen.monologueType.structured_response_4bullets",
  "sprechen:feedbackScreen.monologueType.topic_discussion",
  "sprechen:feedbackScreen.monologueType.vortrag_argumentation",
  "sprechen:picker.subgenres.praesentation",
  "sprechen:picker.subgenres.referat",
  "sprechen:picker.subgenres.vortrag",
  "sprechen:record.lengthWarning.subgenres.bildbeschreibung",
  "sprechen:record.lengthWarning.subgenres.erzaehlung",
  "sprechen:record.lengthWarning.subgenres.praesentation",
  "sprechen:record.lengthWarning.subgenres.vortrag",
  "writing:customPrompt.teilLabel",
  "writing:customPrompt.teilOption",
  "writing:feedback.scorecard.moduleLabel",
  "writing:feedback.teilLabel",
  "writing:promptList.teilSection",
  "writing:promptList.title",
];

// The diagnostic quiz's German sentence content (the question stem, answer
// options, and the "korrekt" keyword) is exam content under test — it must
// stay German regardless of UI locale, the same way a maths app wouldn't
// translate "2 + 2" into words.
const DIAGNOSTIC_GERMAN_CONTENT_KEYS: readonly string[] = [
  "onboarding:diagnostic.options.a",
  "onboarding:diagnostic.options.b",
  "onboarding:diagnostic.options.c",
  "onboarding:diagnostic.options.d",
  "onboarding:diagnostic.questionItalic",
  "onboarding:diagnostic.questionLead",
];

// Interpolation placeholders, numerals, and symbols only — no translatable
// prose for a translator to have left untranslated.
const PLACEHOLDER_OR_SYMBOL_KEYS: readonly string[] = [
  "apprendre:practice.session.progress",
  "auth:login.otpPlaceholder",
  "coach:correction.walkthrough.dimensionScoreLabel",
  "coach:correction.walkthrough.dimensionScoreNoMaxLabel",
  "coach:correction.walkthrough.dimensionScoreWithMaxLabel",
  "dashboard:dailyDrill.duration",
  "dashboard:dailyGoal.progress",
  "dashboard:miniCalendar.dayA11y",
  "onboarding:diagnostic.questionTrail",
  "onboarding:diagnosticResult.clock",
  "onboarding:diagnosticResult.review.noAnswer",
  "onboarding:diagnosticResult.total",
  "onboarding:schedule.options.10",
  "onboarding:schedule.options.20",
  "onboarding:schedule.options.30",
  "onboarding:schedule.options.45",
  "onboarding:schedule.options.5",
  "onboarding:schedule.options.60",
  "onboarding:welcome.teaserProgress",
  "sprechen:customTopic.taskHint",
  "srs:difficulty.againDuration",
  "srs:difficulty.againIcon",
  "srs:difficulty.easyIcon",
  "srs:difficulty.goodDuration",
  "srs:difficulty.goodIcon",
  "srs:difficulty.hardDuration",
  "srs:difficulty.hardIcon",
  "writing:feedback.scoreOutOf100",
];

// Two-letter day abbreviation that happens to match across languages
// (Saturday/samedi → "Sa"); the other six entries in the same array
// correctly differ (Mo/Lu, Tu/Ma, We/Me, Th/Je, Fr/Ve, Su/Di).
const COINCIDENTAL_ABBREVIATION_KEYS: readonly string[] = ["dashboard:miniCalendar.daysShort[5]"];

// Brand name, persona name, exam-board name, CEFR level code, or
// environment code — not translatable prose.
const PROPER_NOUN_OR_CODE_KEYS: readonly string[] = [
  "apprendre:cards.coach.title",
  "coach:chat.header.title",
  "coach:chat.title",
  "coach:drills.header.title",
  "coach:home.title",
  "coach:hub.eyebrow",
  "common:examBoards.ecl",
  "common:examBoards.goethe",
  "common:examBoards.oesd",
  "common:examBoards.telc",
  "common:examBoards.testdaf",
  "common:examLevels.a1",
  "common:examLevels.a2",
  "common:examLevels.b1",
  "common:examLevels.b2",
  "common:examLevels.c1",
  "common:examLevels.c2",
  "common:tabs.coach",
  "onboarding:welcome.brand",
  "onboarding:welcome.teaserEyebrow",
  "settings:about.envDev",
  "settings:about.envProd",
  "settings:language.en",
];

// Ordinary vocabulary spelled identically in English and French (cognates
// and established loanwords — "Drill" and "Feedback" are used as-is in the
// fr catalog too, not just borrowed for en).
const SHARED_COGNATE_KEYS: readonly string[] = [
  "coach:correction.dimensions.kommunikative_gestaltung.name",
  "coach:correction.dimensions.strukturen.name",
  "coach:drills.progressLabel",
  "coach:drills.startCta.title",
  "coach:sideMenu.title",
  "common:corrections.title",
  "dashboard:performanceHistory.row.scoreLabel",
  "notifications:sections.notifications",
  "onboarding:diagnostic.eyebrow",
  "onboarding:diagnosticResult.review.questionLabel",
  "onboarding:motivation.options.immigration",
  "profil:settings.suggestions",
  "schreiben:handwritten.review.corrections.heading",
  "schreiben:live.structure",
  "settings:about.version",
  "settings:objectives.motivationLabel",
  "simulation:question.overline",
  "sprechen:customTopic.maxDuration",
  "sprechen:customTopic.minDuration",
  "sprechen:steps.feedback",
  "writing:customPrompt.maxWords",
  "writing:customPrompt.minWords",
  "writing:feedback.scorecard.totalLabel",
  "writing:feedback.scorecard.unitLabel",
];

/**
 * Four individually-justified special cases (not a category — each has a
 * distinct reason):
 *   - `settings:language.fr` = "Français" — native language name, always
 *     shown regardless of UI locale (mirrors `settings:language.en` =
 *     "English" in the fr catalog). Also on LINGUISTIC_ALLOWLIST since it
 *     contains "ç".
 *   - `coach:correction.walkthrough.betreuerLabel` = "✦ Betreuer · FR" —
 *     labels the *language the Betreuer writes feedback in* (paired with
 *     `examinerLabel` = "Examiner · DE"), a content property, not the UI
 *     locale.
 *   - `examen:modelltests.emptyTitle` = "Keine Prüfungen verfügbar" —
 *     explicitly marked "do NOT fix" in `ModelltestsListScreen.tsx` (N7):
 *     a deliberate mobile-parity quirk, German in the fr locale file too,
 *     ported as-is.
 *   - `onboarding:welcome.titleItalic` = "mit Plan." — deliberate German
 *     fragment of the "DeutschFit, mit Plan." brand tagline, unchanged
 *     across locales by design (the brand name itself is German).
 */
const SPECIAL_CASE_KEYS: readonly string[] = [
  "settings:language.fr",
  "coach:correction.walkthrough.betreuerLabel",
  "examen:modelltests.emptyTitle",
  "onboarding:welcome.titleItalic",
];

/**
 * Known non-French defects, NOT declared legitimate — allowlisted only so
 * this guard doesn't block on bugs outside this task's assigned scope.
 * Each is a real finding, reported in task-2-report.md for follow-up:
 *   - `coach:drills.summary.tally` = "{{correct}} / {{total}} korrekt" —
 *     German "korrekt" where the sibling key `drills.tally` correctly uses
 *     English "correct". Inconsistency, not a French leak.
 *   - `onboarding:diagnostic.category` = "B1 · Grammar" and
 *     `onboarding:diagnosticResult.tagLabel.wortstellung` = "Word-order in
 *     subordinate clauses" — English content also present verbatim in the
 *     fr catalog (fr-side under-translation). Not an en-catalog French
 *     leak, so out of this task's scope, but a real defect on the fr side.
 *   - `coach:chat.header.avatarInitials` / `coach:drills.header.avatarInitials`
 *     = "IA" — "IA" is the French initialism for "Intelligence
 *     Artificielle"; English initials would read "AI". Ambiguous whether
 *     this is a deliberate cross-locale badge (like the German brand
 *     tagline) or a genuine leak — flagged for a design decision, not
 *     changed here.
 */
const KNOWN_DEBT_KEYS: readonly string[] = [
  "coach:drills.summary.tally",
  "onboarding:diagnostic.category",
  "onboarding:diagnosticResult.tagLabel.wortstellung",
  // `onboarding:diagnosticResult.tierSuffix.fast-b2` used to sit here,
  // filed as the same fr-side-under-translation family. That reading was
  // wrong: `fast` is GERMAN for "almost", so this was a German leak in the
  // `en` catalog (an English reader parses it as "quick B2"), and both its
  // siblings were already translated on the en side. Now `"almost B2"` —
  // no exemption needed. The fr side stays "fast B2"; the fr-direction
  // gaps are tracked separately in web#62, not here.
  "coach:chat.header.avatarInitials",
  "coach:drills.header.avatarInitials",
];

const STRUCTURAL_ALLOWLIST = new Set<string>([
  ...GERMAN_EXAM_VOCAB_KEYS,
  ...DIAGNOSTIC_GERMAN_CONTENT_KEYS,
  ...PLACEHOLDER_OR_SYMBOL_KEYS,
  ...COINCIDENTAL_ABBREVIATION_KEYS,
  ...PROPER_NOUN_OR_CODE_KEYS,
  ...SHARED_COGNATE_KEYS,
  ...SPECIAL_CASE_KEYS,
  ...KNOWN_DEBT_KEYS,
]);

// ============================================================================
// Shared plumbing
// ============================================================================

const LOCALES_DIR = path.resolve(__dirname, "../../src/learner/locales");
const EN_LOCALES_DIR = path.join(LOCALES_DIR, "en");
const FR_LOCALES_DIR = path.join(LOCALES_DIR, "fr");

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
    .map((d) => d.name);
}

function loadCatalog(dir: string, fileName: string): Map<string, string> {
  const raw = fs.readFileSync(path.join(dir, fileName), "utf-8");
  const parsed = JSON.parse(raw) as unknown;
  const flat = new Map<string, string>();
  flatten(parsed, "", flat);
  return flat;
}

const catalogFiles = listEnCatalogFiles();

describe("en locale catalogs · no leftover source-language text (web#46, web#35)", () => {
  test("swept more than 10 catalog files (sanity check the glob isn't silently matching nothing)", () => {
    // The S13 bundle-budget script shipped a guard that passed on zero
    // items precisely because it lacked this floor. Don't repeat it.
    expect(catalogFiles.length).toBeGreaterThan(10);
  });

  describe("detector 1 — linguistic (French-marker) scan", () => {
    test("every en/*.json catalog has zero French-only leaf values", () => {
      const violations: LinguisticViolation[] = [];
      for (const fileName of catalogFiles) {
        const ns = path.basename(fileName, ".json");
        const flat = loadCatalog(EN_LOCALES_DIR, fileName);
        for (const [key, value] of flat) {
          const reason = findFrenchMarkers(value);
          if (!reason) continue;
          const fullKey = `${ns}:${key}`;
          if (LINGUISTIC_ALLOWLIST.has(fullKey)) continue;
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
            `language name), add its full key to LINGUISTIC_ALLOWLIST in ` +
            `tests/unit/learner-locales-en-no-french.test.ts and explain why in the comment above the set.`
        );
      }
      expect(violations).toEqual([]);
    });

    test("allowlist entries are all real keys in an en catalog (no stale entries)", () => {
      const allKeys = new Set<string>();
      for (const fileName of catalogFiles) {
        const ns = path.basename(fileName, ".json");
        for (const key of loadCatalog(EN_LOCALES_DIR, fileName).keys()) {
          allKeys.add(`${ns}:${key}`);
        }
      }
      for (const entry of LINGUISTIC_ALLOWLIST) {
        expect(allKeys.has(entry)).toBe(true);
      }
    });

    describe("discrimination — fires on planted French, not on legitimate content", () => {
      test("fires on a planted French sentence (accent marker)", () => {
        expect(findFrenchMarkers("Bientôt disponible")).toBe("accent-or-guillemet");
      });

      test("fires on a planted French sentence using only function words (no accents)", () => {
        expect(findFrenchMarkers("C'est dans le catalogue")).toBe("function-word");
      });

      test("fires on guillemets alone", () => {
        expect(findFrenchMarkers("« Coming soon »")).toBe("accent-or-guillemet");
      });

      // False-positive candidates: legitimate English copy, proper nouns,
      // and German exam vocabulary that appears verbatim in English
      // strings. None of these may trip the walker — German umlauts
      // (ä ö ü ß) are outside the accent set by design, and none of the
      // closed-list function words occur as whole words inside them.
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

  describe("detector 2 — structural (byte-identical-to-fr) scan", () => {
    // Build the full set of comparable en/fr key pairs once for this
    // describe block.
    const comparablePairs: { key: string; enValue: string; frValue: string }[] = [];
    for (const fileName of catalogFiles) {
      const ns = path.basename(fileName, ".json");
      const enFlat = loadCatalog(EN_LOCALES_DIR, fileName);
      const frFlat = loadCatalog(FR_LOCALES_DIR, fileName);
      for (const [key, enValue] of enFlat) {
        const frValue = frFlat.get(key);
        if (frValue === undefined) continue; // key doesn't exist in fr — a different guard's problem
        comparablePairs.push({ key: `${ns}:${key}`, enValue, frValue });
      }
    }

    test("compared more than 500 en/fr key pairs (sanity check the fr-side glob isn't silently matching nothing)", () => {
      // Mirrors the file-count floor above, one level down: this guards
      // against a broken FR_LOCALES_DIR path or a key-matching bug making
      // the comparison loop silently iterate over zero pairs and pass
      // vacuously — the exact failure mode the brief warned about.
      expect(comparablePairs.length).toBeGreaterThan(500);
    });

    test("every byte-identical en/fr pair is accounted for (fixed or allowlisted)", () => {
      const violations: { key: string; value: string }[] = [];
      for (const { key, enValue, frValue } of comparablePairs) {
        if (!isByteIdenticalToFr(enValue, frValue)) continue;
        if (STRUCTURAL_ALLOWLIST.has(key)) continue;
        violations.push({ key, value: enValue });
      }
      if (violations.length > 0) {
        const detail = violations
          .map((v) => `  - ${v.key} = ${JSON.stringify(v.value)}`)
          .join("\n");
        throw new Error(
          `Found ${violations.length} en value(s) byte-identical to their fr counterpart, ` +
            `not yet translated or allowlisted:\n${detail}\n\n` +
            `Translate the value, or if it's legitimately identical (proper noun, German exam ` +
            `vocabulary, placeholder-only, shared cognate), add its full key to one of the ` +
            `category arrays feeding STRUCTURAL_ALLOWLIST in ` +
            `tests/unit/learner-locales-en-no-french.test.ts and explain why.`
        );
      }
      expect(violations).toEqual([]);
    });

    test("structural allowlist entries are all real, currently-identical en/fr key pairs (no stale entries)", () => {
      const identicalKeys = new Set(
        comparablePairs.filter((p) => isByteIdenticalToFr(p.enValue, p.frValue)).map((p) => p.key)
      );
      for (const entry of STRUCTURAL_ALLOWLIST) {
        expect(identicalKeys.has(entry)).toBe(true);
      }
    });

    describe("discrimination — fires on planted untranslated clones, not on real translations", () => {
      // The reviewer's exact injection set from fix-round 1, run here as a
      // synthetic en/fr pair (not written into common.json) so the test
      // doesn't depend on production catalog content. All three must fire
      // despite none of them containing a space at length >= 12 — that
      // narrower filter was measured and explicitly rejected as the
      // trigger condition (see the comment on isByteIdenticalToFr).
      test.each([
        ["Que veux-tu", "Que veux-tu"],
        ["Disponible", "Disponible"],
        ["Continuer", "Continuer"],
        ["Bientôt disponible (control)", "Bientôt disponible"],
      ])("fires when en and fr both say %j", (_label, value) => {
        expect(isByteIdenticalToFr(value, value)).toBe(true);
      });

      test("does not fire on a properly translated pair", () => {
        expect(isByteIdenticalToFr("Coming soon", "Bientôt disponible")).toBe(false);
      });

      test("does not fire on a short properly translated pair (no false negative from over-correcting the length/space miss)", () => {
        expect(isByteIdenticalToFr("Discuss", "Discuter")).toBe(false);
      });
    });
  });
});
