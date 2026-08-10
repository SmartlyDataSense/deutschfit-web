/**
 * `CoachChatComposer` — S9 · Task 9.4, Step 1.
 *
 * Pure presentational component — no i18n/router deps — so this test
 * renders it directly (no `renderWithI18n` needed) and drives it through
 * plain props, matching the file-local composer idiom already used by
 * `CoachChatComposer` on mobile.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CoachChatComposer } from "@/learner/coach/components/CoachChatComposer";

afterEach(cleanup);

function setup(overrides: Partial<React.ComponentProps<typeof CoachChatComposer>> = {}) {
  const onDraftChange = vi.fn();
  const onSubmit = vi.fn();
  render(
    <CoachChatComposer
      draft=""
      onDraftChange={onDraftChange}
      onSubmit={onSubmit}
      placeholder="Écris au Betreuer…"
      {...overrides}
    />
  );
  return { onDraftChange, onSubmit };
}

describe("CoachChatComposer", () => {
  it("pressing Enter in the input calls onSubmit", () => {
    const { onSubmit } = setup({ draft: "hallo" });
    const input = screen.getByTestId("coach-chat-input");
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("clicking the send button calls onSubmit and exposes the sendA11y aria-label", () => {
    const { onSubmit } = setup({ draft: "hallo" });
    const button = screen.getByTestId("coach-chat-send");
    expect(button).toHaveAttribute("aria-label", "Envoyer le message");
    fireEvent.click(button);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("disabled sets disabled on both input and button and blocks both interactions", () => {
    const { onSubmit } = setup({ draft: "hallo", disabled: true });
    const input = screen.getByTestId("coach-chat-input");
    const button = screen.getByTestId("coach-chat-send");

    expect(input).toBeDisabled();
    expect(button).toBeDisabled();

    fireEvent.click(button);
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("typing calls onDraftChange with the new value", () => {
    const { onDraftChange } = setup();
    const input = screen.getByTestId("coach-chat-input");
    fireEvent.change(input, { target: { value: "hallo" } });
    expect(onDraftChange).toHaveBeenCalledWith("hallo");
  });
});
