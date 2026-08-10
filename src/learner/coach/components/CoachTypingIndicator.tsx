/**
 * `CoachTypingIndicator` — three-dot bubble shown while the Betreuer's
 * reply is in-flight (S9 · Task 9.4). Ports
 * `deutschfit-mobile/src/features/coach/components/CoachTypingIndicator.tsx`'s
 * contract (`visible` → renders `null` when `false`) using Tailwind's
 * built-in `animate-bounce` with a per-dot `animationDelay` instead of
 * RN's `Animated` loop (no extra deps).
 *
 * Fully decorative (`aria-hidden`) — no new user-visible/announced copy
 * is introduced (mirrors this app's `Skeleton` "no visible waiting"
 * convention: no text, opacity/motion only).
 */
export interface CoachTypingIndicatorProps {
  readonly visible: boolean;
  readonly testID?: string;
}

const DOT_COUNT = 3;
const DELAY_STEP_MS = 150;

export function CoachTypingIndicator({
  visible,
  testID = "coach.typingIndicator",
}: CoachTypingIndicatorProps) {
  if (!visible) return null;

  return (
    <div className="flex px-4 pb-2" data-testid={testID} aria-hidden="true">
      <div className="flex items-center gap-1 rounded-[var(--radius-lg)] rounded-bl-[var(--radius-sm)] border border-line-soft bg-bg-card px-4 py-2.5">
        {Array.from({ length: DOT_COUNT }, (_, i) => (
          <span
            key={i}
            className="h-2 w-2 animate-bounce rounded-full bg-text-tertiary"
            style={{ animationDelay: `${i * DELAY_STEP_MS}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
