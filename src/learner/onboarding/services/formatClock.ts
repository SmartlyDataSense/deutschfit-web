/**
 * Formats a seconds countdown as `MM:SS`, clamping negatives to `00:00`.
 * Extracted from the mobile diagnostic screen so it is unit-testable
 * without mounting a component.
 */
export function formatClock(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
