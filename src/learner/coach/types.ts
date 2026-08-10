/**
 * Coach slice domain types (S9 · Task 9.1).
 *
 * Ports `deutschfit-mobile/src/features/coach/types.ts` verbatim.
 *
 * Coach is the AI-tutor chat surface. Message roles:
 *   - `user`       — authored by the signed-in learner.
 *   - `assistant`  — reply returned by the coach transport.
 *   - `system`     — optional welcome / system-prompt surface; not
 *                    sent to the backend, only displayed inline.
 *
 * `status` on `CoachMessage` tracks the local lifecycle so the UI can
 * render "sending…" / "failed to send" inline. A message is considered
 * delivered once `status === "complete"`.
 */

export type CoachRole = "user" | "assistant" | "system";

export type CoachMessageStatus = "pending" | "streaming" | "complete" | "error";

export type CoachMessage = {
  /** Stable id — uuid-ish local string for user msgs, server id later. */
  id: string;
  role: CoachRole;
  text: string;
  createdAt: string;
  status: CoachMessageStatus;
  /** Populated when `status === "error"`. */
  errorMessage?: string;
};

/** Request payload shipped to the coach transport. */
export type CoachSendRequest = {
  threadId: string;
  message: string;
  /**
   * The signed-in user's id. Threaded through so the backend can later
   * scope conversation memory per user; not sent on the wire today
   * (mobile parity — the edge function derives identity from the JWT).
   */
  userId: string;
  /**
   * Prior messages, oldest-first. Trimmed + mapped to the wire shape by
   * `mapHistory` in `./api.ts`.
   */
  history: readonly CoachMessage[];
};

/** Response payload returned from the coach transport. */
export type CoachSendResponse = {
  messageId: string;
  text: string;
  /** ISO timestamp. */
  createdAt: string;
};

/** One row of `coach-threads` — client-derived thread summary. */
export type CoachThreadSummary = {
  readonly threadId: string;
  readonly preview: string;
  readonly messageCount: number;
  readonly startedAt: string;
  readonly lastMessageAt: string;
};
