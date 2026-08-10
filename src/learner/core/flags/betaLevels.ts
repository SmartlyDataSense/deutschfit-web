/**
 * Beta level gate for the ExamTrack editor — web port of
 * `deutschfit-mobile/src/core/flags/betaLevels.ts`.
 *
 * CSV env semantics (mobile parity):
 *   - unset            → DEFAULT_CSV ("b1,b2")
 *   - empty string     → NO beta levels (explicit opt-out)
 *   - "b1, C1, nope"   → ["b1","c1"] (trim, lowercase, drop invalid)
 *
 * The env var MUST be read with literal dotted notation —
 * `process.env.NEXT_PUBLIC_BETA_LEVELS_ENABLED` — so webpack's static
 * inlining can see it (see `requiredEnv` doc in `core/api/client.ts`).
 */
import { EXAM_LEVELS, type ExamLevel } from "../exam/examTypes";

const DEFAULT_CSV = "b1,b2";

function parseCsv(raw: string): readonly ExamLevel[] {
  return raw
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter((token): token is ExamLevel => (EXAM_LEVELS as readonly string[]).includes(token));
}

export function getBetaLevels(): readonly ExamLevel[] {
  const raw = process.env.NEXT_PUBLIC_BETA_LEVELS_ENABLED;
  return parseCsv(raw === undefined ? DEFAULT_CSV : raw);
}

export function isLevelInBeta(level: ExamLevel): boolean {
  return getBetaLevels().includes(level);
}
