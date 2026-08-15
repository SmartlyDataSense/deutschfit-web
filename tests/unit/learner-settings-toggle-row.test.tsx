/**
 * S12 — SettingsToggleRow: a REAL switch, unlike the inert analytics
 * placeholder. Pins: role/aria-checked correctness, keyboard
 * accessibility by construction (<button>), onChange(!checked), and
 * disabled inertness.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SettingsToggleRow } from "@/learner/settings/components/SettingsToggleRow";

afterEach(cleanup);

describe("SettingsToggleRow (S12)", () => {
  it("renders a real switch with correct aria-checked in both states", () => {
    const { rerender } = render(
      <SettingsToggleRow label="Notif" checked={false} onChange={() => {}} testID="row" />
    );
    const toggle = screen.getByTestId("row-toggle");
    expect(toggle).toHaveAttribute("role", "switch");
    expect(toggle).toHaveAttribute("aria-checked", "false");
    // Keyboard accessible by construction: a native <button> activates
    // on Enter/Space — an <input disabled readOnly> or a <div> does not.
    expect(toggle.tagName).toBe("BUTTON");
    expect(toggle).not.toBeDisabled();

    rerender(<SettingsToggleRow label="Notif" checked onChange={() => {}} testID="row" />);
    expect(screen.getByTestId("row-toggle")).toHaveAttribute("aria-checked", "true");
  });

  it("clicking fires onChange with the NEGATED value", () => {
    const onChange = vi.fn();
    render(<SettingsToggleRow label="Notif" checked={false} onChange={onChange} testID="row" />);
    fireEvent.click(screen.getByTestId("row-toggle"));
    expect(onChange).toHaveBeenCalledWith(true);

    cleanup();
    const onChange2 = vi.fn();
    render(<SettingsToggleRow label="Notif" checked onChange={onChange2} testID="row" />);
    fireEvent.click(screen.getByTestId("row-toggle"));
    expect(onChange2).toHaveBeenCalledWith(false);
  });

  it("disabled blocks onChange", () => {
    const onChange = vi.fn();
    render(
      <SettingsToggleRow label="Notif" checked={false} disabled onChange={onChange} testID="row" />
    );
    fireEvent.click(screen.getByTestId("row-toggle"));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId("row-toggle")).toBeDisabled();
  });

  it("renders label and optional hint", () => {
    render(
      <SettingsToggleRow
        label="Notif"
        hint="Pourquoi"
        checked={false}
        onChange={() => {}}
        testID="row"
      />
    );
    expect(screen.getByText("Notif")).toBeInTheDocument();
    expect(screen.getByText("Pourquoi")).toBeInTheDocument();
  });

  // NOTE: there is deliberately no "activates on Enter" test. jsdom does
  // not synthesize the native Enter/Space -> click mapping, so such a test
  // would have to fire the click itself — and would then pass just as
  // happily against a <div role="switch">, i.e. against the very defect it
  // claims to guard. The `tagName === "BUTTON"` assertion above is the
  // real guard: keyboard operability follows from the element type, and
  // that IS checkable here.
});
