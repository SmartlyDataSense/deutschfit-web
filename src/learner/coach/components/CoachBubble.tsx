/**
 * `CoachBubble` — a chat bubble for the Coach (Betreuer) thread (S9 ·
 * Task 9.4). Ports `deutschfit-mobile/src/ui/blocks/CoachBubble.tsx`:
 * same `author`/`text`/`timestampLabel`/`type`/`children` contract,
 * Tailwind classes instead of RN `StyleSheet`.
 *
 * Colour contract matches mobile:
 *   - `coach` — card surface (`bg-bg-card`) with primary text, aligned
 *     left, `rounded-bl-[var(--radius-sm)]` tail.
 *   - `user`  — premium-dark surface (`bg-bg-premium`) with inverse
 *     text, aligned right, `rounded-br-[var(--radius-sm)]` tail.
 *
 * `type="drill"` + `children` slot ported for API parity with mobile
 * (unused by the CoachChatScreen transcript today — the drill CTA
 * renders as its own transcript item — but kept so a future caller
 * doesn't need to touch this file to opt in).
 */
import type { ReactNode } from "react";
import clsx from "clsx";

import { AppText } from "@/learner/ui/primitives";

export type CoachBubbleAuthor = "user" | "coach";
export type CoachBubbleType = "text" | "drill";

export interface CoachBubbleProps {
  readonly author: CoachBubbleAuthor;
  readonly text: string;
  readonly timestampLabel?: string;
  readonly type?: CoachBubbleType;
  readonly children?: ReactNode;
  readonly testID?: string;
  readonly className?: string;
}

export function CoachBubble({
  author,
  text,
  timestampLabel,
  type = "text",
  children,
  testID,
  className,
}: CoachBubbleProps) {
  const isCoach = author === "coach";
  const label = timestampLabel ? `${text}. ${timestampLabel}` : text;

  return (
    <div
      className={clsx("flex px-4 pb-2", isCoach ? "justify-start" : "justify-end", className)}
      data-testid={testID}
    >
      <div
        aria-label={label}
        className={clsx(
          "max-w-[82%] rounded-[var(--radius-lg)] border px-4 py-2",
          isCoach
            ? "rounded-bl-[var(--radius-sm)] border-line-soft bg-bg-card"
            : "rounded-br-[var(--radius-sm)] border-bg-premium bg-bg-premium"
        )}
      >
        <AppText tone={isCoach ? "primary" : "inverse"} size="body" className="whitespace-pre-line">
          {text}
        </AppText>
        {type === "drill" && children ? (
          <div className="mt-2 flex flex-col gap-1">{children}</div>
        ) : null}
        {timestampLabel ? (
          <AppText tone={isCoach ? "tertiary" : "inverse"} size="caption" className="mt-1 block">
            {timestampLabel}
          </AppText>
        ) : null}
      </div>
    </div>
  );
}
