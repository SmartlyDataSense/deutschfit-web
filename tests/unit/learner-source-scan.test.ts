/**
 * S13 Task 6 — overlay-scrim token + whole-tree source-scan guard.
 *
 * Part 1 (M-2.6): five modal call sites duplicated the raw
 * `bg-[var(--color-premium-black)]/60` overlay wash instead of a shared
 * token. Asserts `globals.css` now defines `--color-overlay-scrim` and
 * that no file under `src/learner/**` still spells out the raw literal.
 *
 * Part 2 (M-0.8): walks every `src/learner/**\/*.{ts,tsx}` file (excluding
 * `locales/`, which holds translated copy, not markup) and enforces three
 * literal bans that keep hardcoded design values from creeping back in
 * once a token exists for them:
 *
 *   1. no hex color literals (`#rgb` .. `#rrggbbaa`) — read from a
 *      `--color-*` custom property in `src/app/globals.css` instead.
 *   2. no `text-[...]` arbitrary font-size classes — use the named
 *      `text-caption` .. `text-display` scale.
 *   3. no `<prefix>-[<n>px|rem|vh|vw]` arbitrary spacing/size classes —
 *      promote the value to a CSS custom property (see globals.css) or,
 *      for a genuinely one-off implementation-detail pixel value with no
 *      reusable token, add it to ALLOWLIST below with a real reason.
 *
 * Rule (1) needs comments stripped first: issue references in comments
 * (`#365`, `#380`, ...) are valid 3-digit hex and would otherwise produce
 * ~45 false positives on this tree today. `stripComments` is a small
 * state-machine scanner, not a single regex, so that a `//` inside a
 * string or template literal (e.g. a URL) is never mistaken for the start
 * of a line comment — see its doc comment for exactly what it does and
 * does not handle, and which way it errs when unsure.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const LEARNER_DIR = path.resolve(__dirname, "../../src/learner");
const GLOBALS_CSS_PATH = path.resolve(__dirname, "../../src/app/globals.css");

// ---------------------------------------------------------------------------
// Comment stripping
// ---------------------------------------------------------------------------

/**
 * Strips `//` line comments and `/* … *\/` block comments out of TS/TSX
 * source, replacing their contents with spaces (newlines preserved) so
 * every other byte — crucially, the full contents of every string and
 * template literal — passes through unchanged.
 *
 * Implemented as a small character-by-character state machine rather than
 * a regex, because a regex has no way to tell "a `//` that starts a
 * comment" apart from "a `//` inside a string" without also modeling
 * strings. States, tracked on a stack (templates nest via `${...}`):
 *
 *   - "code": the default. `//` opens a line comment, `/*` opens a block
 *     comment, `'`/`"` opens a string, `` ` `` opens a template literal.
 *   - "string": opaque (copied through verbatim, backslash-escapes
 *     consumed as a pair) until the matching unescaped quote closes it.
 *   - "template": opaque until a bare `` ` `` closes it, or `${` opens a
 *     nested "code" frame. That nested frame tracks its own `{`/`}` depth
 *     so a `}` that closes an object literal *inside* the interpolation
 *     doesn't prematurely pop back out to the template text.
 *
 * What this deliberately does NOT model: regex literals (`/like\/this/g`)
 * as their own state. Telling a regex-opening `/` apart from a division
 * operator needs a real parser (it depends on what token precedes it), and
 * building that was judged out of scope here.
 *
 * That gap is NOT harmless by default, though — review round 1 disproved an
 * earlier version of this comment that claimed it could only ever
 * under-strip. Counter-example: `url.split(/\//)`. Every `/` inside a JS/TS
 * regex body other than its two delimiters must be backslash-escaped
 * (an unescaped `/` mid-pattern would terminate the regex), so `\/`
 * followed by the closing delimiter's `/` puts two adjacent raw `/`
 * characters mid-regex — exactly what the naive "code" state reads as a
 * line-comment opener, blanking the rest of the line (or, for `\/*`-shaped
 * regex content, everything up to the next stray `*\/` anywhere later in
 * the file). That's a real silent miss: `url.split(/\//); const bg = "#1a1714"`
 * would have lost the hex literal entirely.
 *
 * Fix: any `/` immediately preceded by a single backslash is never treated
 * as opening a comment (see `precededByBackslash` below) — since escaping is
 * the *only* way a bare `/` can legally appear inside a regex body, this
 * covers every internal regex slash, not just the one probe case. It does
 * not turn this into a real regex tokenizer: the two regex *delimiter*
 * slashes themselves are still ordinary "code" characters with no opaque
 * span between them, so a contrived delimiter-adjacent case could in theory
 * still confuse it. Per the brief's instruction to err toward not-stripping
 * when robustness is in question, an unhandled case here means treating
 * something as ordinary code (at worst a stray false-positive comment
 * match investigated and dismissed by a human), never treating regex
 * content as an opaque span that swallows real code. A grep of this tree
 * found no regex literals containing `/*` or `//`-forming sequences beyond
 * the ones now covered by the guard, so no further gap is live today.
 */
function stripComments(src: string): string {
  type Frame =
    | { kind: "code"; interpolation: boolean; braceDepth: number }
    | { kind: "string"; quote: string }
    | { kind: "template" };

  const out: string[] = [];
  const stack: Frame[] = [{ kind: "code", interpolation: false, braceDepth: 0 }];
  const n = src.length;
  let i = 0;
  // Bounds already checked by every call site (`i < n` / `i + 1 < n`) before
  // indexing; these two helpers just spell that out for the type checker
  // (`noUncheckedIndexedAccess` types raw `src[i]` as `string | undefined`).
  const at = (idx: number): string => src.charAt(idx);
  const top = (): Frame => stack[stack.length - 1] as Frame; // stack invariant: never empties — see below
  // True when `idx` is a `/` that is itself an escaped regex-body slash
  // (`\/`), not a real comment-opening `/`. See the regex-literal note in
  // this function's doc comment for why "preceded by one backslash" is a
  // sound (not just convenient) test for that.
  const precededByBackslash = (idx: number): boolean => idx > 0 && at(idx - 1) === "\\";

  while (i < n) {
    const frame = top();
    const c = at(i);

    if (frame.kind === "string") {
      if (c === "\\" && i + 1 < n) {
        out.push(c, at(i + 1));
        i += 2;
        continue;
      }
      out.push(c);
      if (c === frame.quote) stack.pop();
      i += 1;
      continue;
    } else if (frame.kind === "template") {
      if (c === "\\" && i + 1 < n) {
        out.push(c, at(i + 1));
        i += 2;
        continue;
      }
      if (c === "`") {
        out.push(c);
        stack.pop();
        i += 1;
        continue;
      }
      if (c === "$" && at(i + 1) === "{") {
        out.push("$", "{");
        stack.push({ kind: "code", interpolation: true, braceDepth: 0 });
        i += 2;
        continue;
      }
      out.push(c);
      i += 1;
      continue;
    } else {
      // frame.kind === "code" (only variant left: string/template both
      // `continue` on every path above, so this branch is never entered
      // with those kinds)
      if (c === "/" && at(i + 1) === "/" && !precededByBackslash(i)) {
        while (i < n && at(i) !== "\n") {
          out.push(" ");
          i += 1;
        }
        continue;
      }
      if (c === "/" && at(i + 1) === "*" && !precededByBackslash(i)) {
        out.push(" ", " ");
        i += 2;
        // Only the *opening* `/*` needs the escaped-regex-slash guard: a
        // real block comment always closes at its first `*/`, same as
        // real JS, and once we're legitimately inside one, comment prose
        // is free to contain `\*/`-shaped text (e.g. explaining an escape
        // sequence) without that text un-closing the comment early.
        while (i < n && !(at(i) === "*" && at(i + 1) === "/")) {
          out.push(at(i) === "\n" ? "\n" : " ");
          i += 1;
        }
        if (i < n) {
          out.push(" ", " ");
          i += 2;
        }
        continue;
      }
      if (c === '"' || c === "'") {
        out.push(c);
        stack.push({ kind: "string", quote: c });
        i += 1;
        continue;
      }
      if (c === "`") {
        out.push(c);
        stack.push({ kind: "template" });
        i += 1;
        continue;
      }
      if (frame.interpolation && c === "{") {
        frame.braceDepth += 1;
        out.push(c);
        i += 1;
        continue;
      }
      if (frame.interpolation && c === "}") {
        if (frame.braceDepth > 0) {
          frame.braceDepth -= 1;
        } else {
          // Only a code frame pushed via `${` (interpolation: true) ever
          // pops here; the single bottom-of-stack code frame has
          // interpolation: false and is never popped, so the stack always
          // has at least one element — `top()`'s cast is safe.
          stack.pop();
        }
        out.push(c);
        i += 1;
        continue;
      }
      out.push(c);
      i += 1;
    }
  }

  return out.join("");
}

// ---------------------------------------------------------------------------
// Tree walk
// ---------------------------------------------------------------------------

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "locales") continue; // translated copy, not markup
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listSourceFiles(full));
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function relLearnerPath(file: string): string {
  return path.relative(LEARNER_DIR, file).split(path.sep).join("/");
}

// ---------------------------------------------------------------------------
// Literal patterns
// ---------------------------------------------------------------------------

const HEX_LITERAL_RE = /#[0-9a-fA-F]{3,8}\b/g;
const FONT_SIZE_ARBITRARY_RE = /\btext-\[/g;
// Kebab-case Tailwind utility prefix (letters/digits, hyphen-joined
// segments — e.g. `w`, `min-h`, `tracking`) immediately followed by an
// arbitrary-value bracket holding a bare number + px/rem/vh/vw unit.
// `var(--foo)` brackets (e.g. `rounded-[var(--radius-lg)]`) don't match —
// only bare numeric literals do, which is exactly what this guard bans.
const SPACING_ARBITRARY_RE =
  /\b[a-z][a-z0-9]*(?:-[a-z][a-z0-9]*)*-\[[0-9]+(?:\.[0-9]+)?(?:px|rem|vh|vw)\]/g;

// ---------------------------------------------------------------------------
// Allowlist — single-occurrence, verified mobile-parity pixel literals with
// no reusable token equivalent (component-internal implementation detail,
// not a design-system value). Anything that recurs across 2+ call sites, or
// that has no mobile source to mirror, was tokenized in globals.css instead
// — see the "S13 Task 6" comment block there. Every entry must cite the
// mobile source it mirrors; `reason.length > 10` is enforced below so an
// entry can't be added without saying why.
// ---------------------------------------------------------------------------

interface AllowlistEntry {
  readonly file: string;
  readonly literal: string;
  readonly reason: string;
}

const ALLOWLIST: readonly AllowlistEntry[] = [
  {
    file: "ui/primitives/Waveform.tsx",
    literal: "w-[3px]",
    reason: "mobile parity: 3px bar width mirrors mobile Waveform",
  },
  {
    file: "ui/blocks/ScoreHeaderCard.tsx",
    literal: "py-[3px]",
    reason:
      "mobile parity: paddingVertical:3 around the score track (mobile ScoreHeaderCard.tsx:187)",
  },
  {
    file: "ui/blocks/ScoreHeaderCard.tsx",
    literal: "h-[10px]",
    reason: "mobile parity: height:10 score track fill bar (mobile ScoreHeaderCard.tsx:190)",
  },
  {
    file: "ui/blocks/ScoreHeaderCard.tsx",
    literal: "w-[3px]",
    reason: "mobile parity: width:3 objectif passline marker (mobile ScoreHeaderCard.tsx:204)",
  },
  {
    file: "ui/blocks/ScoreHeaderCard.tsx",
    literal: "h-[18px]",
    reason: "mobile parity: height:18 objectif label row (mobile ScoreHeaderCard.tsx:211)",
  },
  {
    file: "sprechen/components/AnnotatedTranscript.tsx",
    literal: "min-w-[20px]",
    reason:
      "mobile parity: minWidth:20 ordinal badge (mobile sprechen AnnotatedTranscript.tsx:172)",
  },
  {
    file: "onboarding/screens/DiagnosticScreen.tsx",
    literal: "h-[3px]",
    reason: "mobile parity: ACCENT_UNDERLINE_HEIGHT=3 in OnboardingDiagnosticScreen.tsx:53",
  },
  // RADIO_OUTER (22) / RADIO_INNER (10) — h-[Npx] + w-[Npx] paired at two
  // sites each in this file — were promoted to --onboarding-radio-outer-size
  // / --onboarding-radio-inner-size in globals.css instead of allowlisted
  // (review round 1, minor 2): they recur, same bar `--control-height-lg`
  // was promoted on, unlike the true one-offs below.
];

const allowlistKey = (file: string, literal: string): string => `${file}::${literal}`;
const ALLOWED = new Set(ALLOWLIST.map((e) => allowlistKey(e.file, e.literal)));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("S13 Task 6 · overlay-scrim token", () => {
  it("globals.css defines --color-overlay-scrim, derived via color-mix (no new hex)", () => {
    const css = fs.readFileSync(GLOBALS_CSS_PATH, "utf-8");
    expect(css).toMatch(
      /--color-overlay-scrim:\s*color-mix\(in srgb, var\(--color-premium-black\) 44%, transparent\);/
    );
  });

  it("no file under src/learner/** still spells out the raw premium-black/60 overlay literal", () => {
    const files = listSourceFiles(LEARNER_DIR);
    const violations: string[] = [];
    for (const file of files) {
      const content = fs.readFileSync(file, "utf-8");
      if (content.includes("premium-black)]/60")) {
        violations.push(relLearnerPath(file));
      }
    }
    expect(violations).toEqual([]);
  });
});

describe("S13 Task 6 · whole-tree literal scan guard", () => {
  const files = listSourceFiles(LEARNER_DIR);

  it("walked more than a handful of files (sanity check the walk isn't silently matching nothing)", () => {
    // A targeted grep is not a sweep — an earlier task grepped only
    // `rounded-2xl` and missed a bare `rounded-xl`. This guards against
    // this test's own walk silently degrading to "scans nothing" (e.g. a
    // typo'd LEARNER_DIR) and passing for the wrong reason.
    expect(files.length).toBeGreaterThan(50);
  });

  it("has zero hex color literals outside comments", () => {
    const violations: string[] = [];
    for (const file of files) {
      const stripped = stripComments(fs.readFileSync(file, "utf-8"));
      const matches = stripped.match(HEX_LITERAL_RE) ?? [];
      for (const m of matches) violations.push(`${relLearnerPath(file)}: ${m}`);
    }
    if (violations.length > 0) {
      throw new Error(
        `Found ${violations.length} hex color literal(s) outside comments:\n` +
          violations.map((v) => `  - ${v}`).join("\n") +
          `\n\nRead from a --color-* custom property in src/app/globals.css instead.`
      );
    }
  });

  it("has zero text-[ arbitrary font-size classes", () => {
    const violations: string[] = [];
    for (const file of files) {
      const stripped = stripComments(fs.readFileSync(file, "utf-8"));
      const matches = stripped.match(FONT_SIZE_ARBITRARY_RE) ?? [];
      for (const m of matches) violations.push(`${relLearnerPath(file)}: ${m}`);
    }
    if (violations.length > 0) {
      throw new Error(
        `Found ${violations.length} arbitrary text-[ font-size class(es):\n` +
          violations.map((v) => `  - ${v}`).join("\n") +
          `\n\nUse the named text-caption..text-display scale instead.`
      );
    }
  });

  it("has zero un-allowlisted arbitrary px/rem/vh/vw spacing/size classes", () => {
    const violations: string[] = [];
    for (const file of files) {
      const rel = relLearnerPath(file);
      const stripped = stripComments(fs.readFileSync(file, "utf-8"));
      const matches = stripped.match(SPACING_ARBITRARY_RE) ?? [];
      for (const m of matches) {
        if (ALLOWED.has(allowlistKey(rel, m))) continue;
        violations.push(`${rel}: ${m}`);
      }
    }
    if (violations.length > 0) {
      throw new Error(
        `Found ${violations.length} un-allowlisted arbitrary spacing/size class(es):\n` +
          violations.map((v) => `  - ${v}`).join("\n") +
          `\n\nPromote to a CSS custom property in globals.css, or add a justified entry ` +
          `(reason.length > 10) to ALLOWLIST in tests/unit/learner-source-scan.test.ts.`
      );
    }
  });

  it("every ALLOWLIST entry has a real reason, not a rubber stamp", () => {
    for (const entry of ALLOWLIST) {
      expect(entry.reason.length).toBeGreaterThan(10);
    }
  });

  it("every ALLOWLIST entry matches a literal that's actually still in the tree (no stale entries)", () => {
    for (const entry of ALLOWLIST) {
      const full = path.join(LEARNER_DIR, entry.file);
      expect(fs.existsSync(full), `${entry.file} does not exist`).toBe(true);
      const stripped = stripComments(fs.readFileSync(full, "utf-8"));
      const matches: string[] = stripped.match(SPACING_ARBITRARY_RE) ?? [];
      expect(
        matches.includes(entry.literal),
        `${entry.file} no longer contains the literal "${entry.literal}" — remove the stale ALLOWLIST entry`
      ).toBe(true);
    }
  });
});

describe("stripComments", () => {
  it("blanks out a line comment but keeps surrounding code", () => {
    expect(stripComments("const x = 1; // #365\nconst y = 2;")).toBe(
      "const x = 1;        \nconst y = 2;"
    );
  });

  it("blanks out a block comment, preserving newlines inside it", () => {
    const src = "a(); /* #365\n#380 */ b();";
    const stripped = stripComments(src);
    expect(stripped).not.toContain("#365");
    expect(stripped).not.toContain("#380");
    expect(stripped.split("\n").length).toBe(src.split("\n").length);
    expect(stripped.length).toBe(src.length);
    expect(stripped.startsWith("a();")).toBe(true);
    expect(stripped.trimEnd().endsWith("b();")).toBe(true);
  });

  it("does not treat // inside a string literal as a comment", () => {
    const src = 'const url = "https://example.com/#365";';
    expect(stripComments(src)).toBe(src);
  });

  it("does not treat // inside a template literal as a comment", () => {
    const src = "const url = `https://example.com/${id}`;";
    expect(stripComments(src)).toBe(src);
  });

  it("keeps a } that closes an object literal inside a template interpolation from popping the template early", () => {
    const src = "const s = `a${(() => { return 1; })()}b // not a comment`;";
    expect(stripComments(src)).toBe(src);
  });

  it("does not strip a hex-shaped comment reference and does not touch a real hex literal in code", () => {
    const src = '// issue #365\nconst c = "#1a1714";';
    const stripped = stripComments(src);
    expect(stripped).not.toContain("#365");
    expect(stripped).toContain("#1a1714");
  });

  // Review round 1, minor 3: a regex literal's escaped body slash (`\/`)
  // landing right next to its closing delimiter's `/` puts two raw `/`
  // characters back to back mid-regex — exactly the shape the naive "code"
  // state used to misread as a line-comment opener, blanking the rest of
  // the line (including a real hex literal on the same line). These pin
  // the exact reviewer-supplied probes plus the `/*`-forming analog.
  it("does not misread an escaped regex-body slash before the closing delimiter as a line comment", () => {
    const src = 'const segs = url.split(/\\//); const bg = "#1a1714";';
    expect(stripComments(src)).toBe(src);
  });

  it("does not misread a global escaped-slash regex as a line comment either", () => {
    const src = 'path.replace(/\\//g, "-"); const bg = "#1a1714";';
    expect(stripComments(src)).toBe(src);
  });

  it("does not misread an escaped regex-body slash immediately before a literal * as a block-comment opener", () => {
    const src = 'const trimmed = s.replace(/\\/*/, ""); const bg = "#1a1714";';
    expect(stripComments(src)).toBe(src);
  });

  it("still closes a real block comment at its first */ even if the comment prose contains an escaped-slash-shaped run", () => {
    // The opening-side guard must not leak into the closing-side scan: a
    // genuine comment explaining an escape sequence should still end where
    // it visibly ends, not run on to the next accidental */ in the file.
    const src = 'const a = 1; /* explains \\*/ escaping */ const bg = "#1a1714";';
    const stripped = stripComments(src);
    expect(stripped).not.toContain("explains");
    expect(stripped).toContain("#1a1714");
    expect(stripped).toContain("const bg =");
  });
});
