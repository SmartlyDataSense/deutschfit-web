"use client";

/**
 * `CoachChatComposer` — the Coach chat message input (S9 · Task 9.4).
 *
 * Web deviation from mobile's `CoachChatComposer` (which submits only via
 * the on-screen keyboard's "send" return key, no visible button): the
 * web composer adds an explicit send button (testID `coach-chat-send`)
 * since a physical Enter key isn't guaranteed on every input device, and
 * a submit affordance next to a pill-shaped text field is the
 * conventional web chat pattern. Enter-to-submit is preserved
 * (`onKeyDown`, not `onSubmitEditing` — no RN event to port).
 *
 * Pure presentational — the screen owns `draft` state and the send
 * outcome; this component never calls the coach transport directly.
 */
import type { ChangeEvent, KeyboardEvent } from "react";
import { useCallback } from "react";

import { Icon } from "@/learner/core/icons";

export interface CoachChatComposerProps {
  readonly draft: string;
  readonly onDraftChange: (value: string) => void;
  readonly onSubmit: () => void;
  readonly placeholder: string;
  readonly disabled?: boolean;
  /**
   * Pre-translated a11y label for the text input
   * (`coach:chat.composer.inputA11y`). Required — no French fallback
   * baked into this component, so an `en`-locale caller can't silently
   * render untranslated copy by omitting the prop.
   */
  readonly inputAccessibilityLabel: string;
  /**
   * Pre-translated a11y label for the send button
   * (`coach:chat.composer.sendA11y`). Required, same rationale as
   * `inputAccessibilityLabel`.
   */
  readonly sendAccessibilityLabel: string;
  readonly testID?: string;
}

export function CoachChatComposer({
  draft,
  onDraftChange,
  onSubmit,
  placeholder,
  disabled = false,
  inputAccessibilityLabel,
  sendAccessibilityLabel,
  testID = "coach-chat-composer",
}: CoachChatComposerProps) {
  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      onDraftChange(e.target.value);
    },
    [onDraftChange]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      if (disabled) return;
      onSubmit();
    },
    [disabled, onSubmit]
  );

  const handleSendClick = useCallback(() => {
    if (disabled) return;
    onSubmit();
  }, [disabled, onSubmit]);

  return (
    <div
      className="flex items-center gap-2 border-t border-line-soft bg-bg-hero px-4 pt-2 pb-4"
      data-testid={testID}
    >
      <div className="flex min-h-10 flex-1 items-center rounded-[var(--radius-full)] border border-line-soft bg-bg-card px-4 py-2">
        <input
          type="text"
          value={draft}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          aria-label={inputAccessibilityLabel}
          data-testid="coach-chat-input"
          className="w-full bg-transparent text-body text-text-primary outline-none placeholder:text-text-tertiary disabled:cursor-not-allowed"
        />
      </div>
      <button
        type="button"
        onClick={handleSendClick}
        disabled={disabled}
        aria-label={sendAccessibilityLabel}
        data-testid="coach-chat-send"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-full)] bg-cta text-cta-ink transition disabled:cursor-not-allowed disabled:bg-line-soft"
      >
        <Icon name="arrow-right" size={18} />
      </button>
    </div>
  );
}
