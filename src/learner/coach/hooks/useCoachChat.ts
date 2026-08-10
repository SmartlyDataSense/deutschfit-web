/**
 * Coach chat state hook (S9 · Task 9.2).
 *
 * Ports `deutschfit-mobile/src/features/coach/hooks/useCoachChat.ts`
 * verbatim — same state machine, same optimistic-append/repair flow,
 * same in-flight guard. Web delta: an injectable `deps.sendCoachMessage`
 * (established web pattern from `useDailyDrill` / `useDialogueSession` —
 * hook tests script the transport directly instead of `vi.mock`-ing the
 * facade module).
 *
 * `generateThreadId` also lives here per the task-9.2 brief (mobile
 * defines it inline in `CoachChatScreen.tsx:216` — a screen-layer file
 * that isn't being ported this task; the body is verbatim, only the
 * location moved).
 *
 * State machine:
 *   idle       — no in-flight request; safe to `send()`.
 *   sending    — transport dispatched, awaiting reply. `send()` is a
 *                no-op while in this state.
 *   streaming  — reserved for when the backend ships SSE (unused today).
 *   complete   — last reply landed cleanly.
 *   error      — last request failed; the user message is preserved
 *                and the error is exposed on `lastError`.
 */
import { useCallback, useMemo, useRef, useState } from "react";

import { sendCoachMessage } from "../api";
import type { CoachMessage, CoachMessageStatus, CoachSendRequest } from "../types";

export type CoachChatPhase = "idle" | "sending" | "streaming" | "complete" | "error";

export type CoachChatState = {
  readonly threadId: string;
  readonly messages: readonly CoachMessage[];
  readonly phase: CoachChatPhase;
  readonly lastError: string | null;
};

export type CoachChatActions = {
  /** Append a user message and request a coach reply. */
  send: (text: string) => Promise<void>;
  /** Clear the local error banner. No-op if `phase !== "error"`. */
  dismissError: () => void;
  /** Reset the entire thread — used by "start new conversation" buttons. */
  reset: () => void;
};

/**
 * Outcome surfaced to the optional `onSendOutcome` hook. Lets the screen
 * fire analytics + trigger UI side-effects (rate-limit countdown, error
 * toast) without the hook having to know about either analytics or i18n.
 */
export type CoachSendOutcome =
  | { readonly kind: "success"; readonly durationMs: number }
  | { readonly kind: "error"; readonly code: string; readonly durationMs: number };

export type UseCoachChatArgs = {
  /** Signed-in user id — forwarded to the transport for future scoping. */
  readonly userId: string;
  /**
   * Stable thread id. Callers usually generate one per screen mount via
   * `generateThreadId()`.
   */
  readonly threadId: string;
  /** Optional seed messages — typically a system welcome line. */
  readonly initialMessages?: readonly CoachMessage[];
  /**
   * Fires after every completed `send()` call (success or failure). Lets
   * the screen keep analytics + UI side-effects out of the hook.
   */
  readonly onSendOutcome?: (outcome: CoachSendOutcome) => void;
  /** Test injection seam — defaults to the real `sendCoachMessage`. */
  readonly deps?: {
    readonly sendCoachMessage?: typeof sendCoachMessage;
  };
};

export type UseCoachChatResult = CoachChatState & CoachChatActions;

function uuidish(): string {
  const rand = (): string =>
    Math.floor(Math.random() * 0xffffffff)
      .toString(16)
      .padStart(8, "0");
  return `${Date.now().toString(16)}-${rand()}-${rand()}`;
}

function markStatus(
  message: CoachMessage,
  status: CoachMessageStatus,
  errorMessage?: string
): CoachMessage {
  const next: CoachMessage = { ...message, status };
  if (errorMessage !== undefined) {
    next.errorMessage = errorMessage;
  }
  return next;
}

/**
 * Mint a client-local thread id. Mobile defines this inline in
 * `CoachChatScreen.tsx`; ported verbatim (body only — the location moves
 * to this hook module on web).
 */
export function generateThreadId(): string {
  const rand = (): string =>
    Math.floor(Math.random() * 0xffffffff)
      .toString(16)
      .padStart(8, "0");
  return `${Date.now().toString(16)}-${rand()}`;
}

export function useCoachChat(args: UseCoachChatArgs): UseCoachChatResult {
  const { userId, threadId, initialMessages, onSendOutcome } = args;
  const sendTransport = args.deps?.sendCoachMessage ?? sendCoachMessage;
  const [messages, setMessages] = useState<readonly CoachMessage[]>(initialMessages ?? []);
  const [phase, setPhase] = useState<CoachChatPhase>("idle");
  const [lastError, setLastError] = useState<string | null>(null);

  // Guard against overlapping `send()` calls — if the user double-taps,
  // we drop the second call rather than racing two transport round-trips.
  const inFlightRef = useRef(false);

  // Stash the outcome callback in a ref so `send` does not need to live
  // in the memoisation closure for the callback — re-renders with a new
  // `onSendOutcome` should not bust the callback identity.
  const onSendOutcomeRef = useRef(onSendOutcome);
  onSendOutcomeRef.current = onSendOutcome;

  const send = useCallback(
    async (text: string): Promise<void> => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (inFlightRef.current) return;

      inFlightRef.current = true;
      setLastError(null);

      const userMessage: CoachMessage = {
        id: uuidish(),
        role: "user",
        text: trimmed,
        createdAt: new Date().toISOString(),
        status: "pending",
      };

      // Capture the history we send to the transport before we append
      // the new user msg — matches the shape the backend expects.
      const history = messages;
      setMessages((prev) => [...prev, userMessage]);
      setPhase("sending");

      const request: CoachSendRequest = {
        threadId,
        message: trimmed,
        userId,
        history,
      };

      const startedAt = Date.now();
      try {
        const reply = await sendTransport(request);

        setMessages((prev) => {
          // Mark the user message as delivered + append the assistant reply.
          const withUserComplete = prev.map((m) =>
            m.id === userMessage.id ? markStatus(m, "complete") : m
          );
          const assistantMessage: CoachMessage = {
            id: reply.messageId,
            role: "assistant",
            text: reply.text,
            createdAt: reply.createdAt,
            status: "complete",
          };
          return [...withUserComplete, assistantMessage];
        });
        setPhase("complete");
        onSendOutcomeRef.current?.({
          kind: "success",
          durationMs: Date.now() - startedAt,
        });
      } catch (error) {
        const code = error instanceof Error && error.message ? error.message : "coach_send_failed";
        setMessages((prev) =>
          prev.map((m) => (m.id === userMessage.id ? markStatus(m, "error", code) : m))
        );
        setLastError(code);
        setPhase("error");
        onSendOutcomeRef.current?.({
          kind: "error",
          code,
          durationMs: Date.now() - startedAt,
        });
      } finally {
        // Re-armed here (not in an effect cleanup) — Constraint 12.
        inFlightRef.current = false;
      }
    },
    [messages, threadId, userId, sendTransport]
  );

  const dismissError = useCallback(() => {
    setLastError(null);
    if (phase === "error") {
      setPhase("idle");
    }
  }, [phase]);

  const reset = useCallback(() => {
    inFlightRef.current = false;
    setMessages(initialMessages ?? []);
    setPhase("idle");
    setLastError(null);
  }, [initialMessages]);

  return useMemo(
    () => ({
      threadId,
      messages,
      phase,
      lastError,
      send,
      dismissError,
      reset,
    }),
    [threadId, messages, phase, lastError, send, dismissError, reset]
  );
}
