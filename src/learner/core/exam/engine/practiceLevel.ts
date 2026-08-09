/**
 * Levels the practice serve path supports today (§5.4 of the telc
 * text-formats spec). The exam context stores lowercase levels; the wire
 * contract takes uppercase. `null` = unsupported — callers must render the
 * unsupported state without hitting the network.
 *
 * Verbatim port of `deutschfit-mobile/src/core/exam/practiceLevel.ts`.
 */
export type PracticeLevel = "B1" | "B2";

export function toPracticeLevel(level: string): PracticeLevel | null {
  const normalized = level.trim().toUpperCase();
  if (normalized === "B1" || normalized === "B2") {
    return normalized;
  }
  return null;
}
