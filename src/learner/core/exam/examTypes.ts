/**
 * Canonical exam-board + CEFR-level types for the app.
 *
 * These mirror the `user_profiles.exam_board` / `user_profiles.exam_level`
 * check-constraints defined in `deutschfit-backend/supabase/migrations/
 * 20260430000000_0027_user_exam_board_level.sql`:
 *
 *   - `exam_board` ∈ {'goethe','telc','oesd','testdaf','ecl','pflege',
 *     'beruf_tourismus'}
 *   - `exam_level` ∈ {'a1','a2','b1','b2','c1','c2'}
 *
 * The v1.0 global default is `{ board: 'goethe', level: 'b1' }`, matching the
 * server-side default and the onboarding copy in
 * `deutschfit-meta/prompts/ship-v1-end-to-end.md` §5/§6.
 *
 * **Do not inline string unions** elsewhere. Every feature that speaks about
 * an exam board or CEFR level imports from this module so a future addition
 * (e.g. `c1-hochschule`) is a single-file change.
 */

/** Every exam board shipped in v1.0. Order is the preferred picker order. */
export const EXAM_BOARDS = [
  "goethe",
  "telc",
  "oesd",
  "testdaf",
  "ecl",
  "pflege",
  "beruf_tourismus",
] as const;

export type ExamBoard = (typeof EXAM_BOARDS)[number];

/** CEFR levels shipped in v1.0. Always lower-case to match the DB check. */
export const EXAM_LEVELS = ["a1", "a2", "b1", "b2", "c1", "c2"] as const;

export type ExamLevel = (typeof EXAM_LEVELS)[number];

/**
 * Where the user's current selection came from.
 *
 * Used for light telemetry / UX (e.g. Settings shows a "changed in Settings"
 * hint; onboarding can branch if the value is still the onboarding default).
 */
export type ExamContextSource = "onboarding" | "settings";

/** Global default — must match the DB default. */
export const DEFAULT_EXAM_BOARD: ExamBoard = "goethe";
export const DEFAULT_EXAM_LEVEL: ExamLevel = "b1";
export const DEFAULT_EXAM_SOURCE: ExamContextSource = "onboarding";

/**
 * Which CEFR levels a given board ships in v1.0.
 *
 * Mirrors the §6.1 matrix in the ship plan. A board omitted from this map
 * would fall back to every level.
 */
export const LEVELS_BY_BOARD: Readonly<Record<ExamBoard, readonly ExamLevel[]>> = {
  goethe: ["a1", "a2", "b1", "b2", "c1", "c2"],
  telc: ["a1", "a2", "b1", "b2", "c1", "c2"],
  oesd: ["a1", "a2", "b1", "b2", "c1", "c2"],
  testdaf: ["b2", "c1"],
  ecl: ["b1", "b2", "c1"],
  pflege: ["b2"],
  beruf_tourismus: ["a1", "a2", "b1", "b2"],
};

/**
 * Which `cert_code` values (see `deutschfit-backend` 0002 reference data seed)
 * belong to a given exam board. Modelltests are tagged with the DB `cert_code`
 * (e.g. `GOETHE`, `GOETHE_OESD`, `TELC`); clients filter the list by matching
 * `cert_code` against the board the user is currently on.
 *
 * `goethe` and `oesd` both include the shared `GOETHE_OESD` rows because those
 * modelltests run under the joint ÖSD / Goethe standard and should surface to
 * users on either board.
 */
export const CERT_CODES_BY_BOARD: Readonly<Record<ExamBoard, readonly string[]>> = {
  goethe: ["GOETHE", "GOETHE_OESD"],
  oesd: ["OESD", "GOETHE_OESD"],
  telc: ["TELC"],
  testdaf: ["TESTDAF"],
  ecl: ["ECL"],
  pflege: [],
  beruf_tourismus: ["TELC"],
};

export function isExamBoard(value: unknown): value is ExamBoard {
  return typeof value === "string" && (EXAM_BOARDS as readonly string[]).includes(value);
}

export function isExamLevel(value: unknown): value is ExamLevel {
  return typeof value === "string" && (EXAM_LEVELS as readonly string[]).includes(value);
}

export function isExamContextSource(value: unknown): value is ExamContextSource {
  return value === "onboarding" || value === "settings";
}

/**
 * Clamp a board/level pair to a combo that actually ships. If the incoming
 * level isn't in `LEVELS_BY_BOARD[board]`, we fall back to the first level
 * the board ships (closest to user intent) rather than the global default —
 * prevents weird UX if a user rotates from `goethe c2` to `testdaf` (which
 * doesn't ship c2).
 */
export function normaliseExamSelection(
  board: ExamBoard,
  level: ExamLevel
): { board: ExamBoard; level: ExamLevel } {
  const shipped = LEVELS_BY_BOARD[board];
  if (shipped.includes(level)) {
    return { board, level };
  }
  const first = shipped[0] ?? DEFAULT_EXAM_LEVEL;
  return { board, level: first };
}

/**
 * Render a short user-facing badge label for the exam track.
 *
 * Per F-3 (2026-05-04), board branding is hidden from every UI surface — the
 * user only ever sees CEFR levels (A1…C2). The `board` parameter is kept in
 * the signature so callers can opt into a future debranded variant without a
 * second refactor, but the rendered output is level-only (e.g. `"B1"`).
 */
export function formatExamTrackLabel(_board: ExamBoard, level: ExamLevel): string {
  return level.toUpperCase();
}

/** Describes an attempted exam-track change — used by the confirm modal. */
export interface ExamChange {
  readonly from: { readonly board: ExamBoard; readonly level: ExamLevel };
  readonly to: { readonly board: ExamBoard; readonly level: ExamLevel };
}

/**
 * Classifies an `ExamChange` as:
 *   - `'board'`  — board differs (hard consequence: content reshuffle +
 *                   diagnostic archive + re-prompt). Dominates when both
 *                   board and level differ.
 *   - `'level'`  — board unchanged, level differs (soft advisory: sub-slice
 *                   shift, history kept).
 *   - `'none'`   — identical pair; no modal should render.
 *
 * Drives the `ConfirmExamChangeModal` variant + which bullet copy to show.
 */
export function classifyExamChange(change: ExamChange): "board" | "level" | "none" {
  if (change.from.board !== change.to.board) return "board";
  if (change.from.level !== change.to.level) return "level";
  return "none";
}
