import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { initLearnerI18n } from "@/learner/core/i18n";
import { renderWithI18n } from "./helpers/renderWithI18n";
import { SettingsRow } from "@/learner/profil/components/SettingsRow";
import { IdentityCard } from "@/learner/profil/components/IdentityCard";
import { SettingsPickerRow } from "@/learner/settings/components/SettingsPickerRow";
import { ConfirmExamChangeModal } from "@/learner/ui/blocks/ConfirmExamChangeModal";
import { emptyProfilStats } from "@/learner/profil/data/fixtures";

afterEach(cleanup);
beforeAll(() => initLearnerI18n("fr"));

describe("SettingsRow (S11.3)", () => {
  it("renders label + value + chevron and fires onClick", () => {
    const onClick = vi.fn();
    render(<SettingsRow label="Parcours" value="B1" onClick={onClick} testID="row-x" />);
    fireEvent.click(screen.getByTestId("row-x"));
    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.getByText("Parcours")).toBeInTheDocument();
    expect(screen.getByText("B1")).toBeInTheDocument();
  });

  // S11.4 layout decision: the row is FLAT — no own background/radius.
  // Mobile's ProfilScreen groups rows in one shared container, and
  // mobile's SettingsScreen (the fuller precedent) makes that grouping
  // a single `bg-bg-card` / rounded surface per section, not per-row
  // cards. The caller owns that shared surface (see ProfilScreen.tsx);
  // this pins the row itself to stay transparent so a future edit
  // doesn't quietly reintroduce a double-card look when rows are
  // grouped.
  it("is flat — no own background or radius (grouping is the caller's job)", () => {
    render(<SettingsRow label="Parcours" value="B1" onClick={vi.fn()} testID="row-flat" />);
    const row = screen.getByTestId("row-flat");
    expect(row.className).not.toContain("bg-bg-card");
    expect(row.className).not.toContain("rounded-[var(--radius-md)]");
  });

  it("warning tone hides the chevron; disabled blocks the click", () => {
    const onClick = vi.fn();
    render(
      <>
        <SettingsRow label="Supprimer" tone="warning" onClick={onClick} testID="row-warn" />
        <SettingsRow label="Off" disabled onClick={onClick} testID="row-off" />
      </>
    );
    expect(screen.getByText("Supprimer")).toBeInTheDocument();
    expect(screen.getByText("Off")).toBeInTheDocument();
    expect(within(screen.getByTestId("row-warn")).queryByTestId("row-warn-chevron")).toBeNull();
    fireEvent.click(screen.getByTestId("row-off"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("href renders an anchor opening in a new tab", () => {
    render(<SettingsRow label="Confidentialité" href="/fr/legal/privacy" testID="row-a" />);
    const anchor = screen.getByTestId("row-a");
    expect(anchor.tagName).toBe("A");
    expect(anchor).toHaveAttribute("target", "_blank");
    expect(anchor).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("href + disabled renders a non-navigable, non-interactive row (no live href)", () => {
    render(
      <SettingsRow
        label="Confidentialité"
        href="/fr/legal/privacy"
        disabled
        testID="row-disabled-link"
      />
    );
    const row = screen.getByTestId("row-disabled-link");
    expect(row.tagName).not.toBe("A");
    expect(row).not.toHaveAttribute("href");
    expect(row).toHaveAttribute("aria-disabled", "true");
    expect(row.className).toContain("pointer-events-none");
  });
});

describe("IdentityCard (S11.3)", () => {
  it("renders name, location · languages subtitle and the exam pill", () => {
    renderWithI18n(
      <IdentityCard
        stats={{
          ...emptyProfilStats,
          fullName: "Marie Dupont",
          location: "Douala",
          languages: ["Français", "Anglais"],
        }}
        examPill="B1"
        testID="profil-identity-card"
      />
    );
    expect(screen.getByText("Marie Dupont")).toBeInTheDocument();
    expect(screen.getByText("Douala · Français · Anglais")).toBeInTheDocument();
    expect(screen.getByTestId("profil-identity-card-exam-pill")).toHaveTextContent("B1");
  });

  // web#57: `tone="coachInk"` (`text-coach-ink`, white) must reliably win
  // on the avatar-circle initial — `className="text-coach-ink"` used to
  // lose silently to AppText's default `tone="primary"`
  // (`text-text-primary`) because clsx() attribute order doesn't drive
  // the CSS cascade; Tailwind's generated stylesheet rule order does.
  it("avatar initial carries the coach-ink tone, not the default primary tone", () => {
    renderWithI18n(
      <IdentityCard
        stats={{
          ...emptyProfilStats,
          fullName: "Marie Dupont",
          location: "Douala",
          languages: [],
        }}
        examPill="B1"
        testID="profil-identity-card"
      />
    );
    const avatar = screen.getByTestId("profil-identity-card-avatar");
    const initial = within(avatar).getByText("M");
    expect(initial.className).toContain("text-coach-ink");
    expect(initial.className).not.toContain("text-text-primary");
  });

  // web#58 (fix round 1): the outer wrapper used to carry `role="group"`
  // plus a composed `aria-label` (`${fullName}. ${locationA11y}.
  // ${examPill}.`) duplicating exactly what its `AppText`/`<span>`
  // children already render. `role="group"` is not children-
  // presentational on web, so a screen reader announced the composed
  // name and then re-read the name/subtitle/pill a second time. This
  // pins the wrapper carrying no role or aria-label at all — the
  // children read on their own.
  it("carries no wrapper role/aria-label — content reads naturally, not duplicated", () => {
    renderWithI18n(
      <IdentityCard
        stats={{
          ...emptyProfilStats,
          fullName: "Marie Dupont",
          location: "Douala",
          languages: ["Français", "Anglais"],
        }}
        examPill="B1"
        testID="profil-identity-card"
      />
    );
    const card = screen.getByTestId("profil-identity-card");
    expect(card).not.toHaveAttribute("role");
    expect(card).not.toHaveAttribute("aria-label");
    expect(screen.getByText("Marie Dupont")).toBeInTheDocument();
    expect(screen.getByText("Douala · Français · Anglais")).toBeInTheDocument();
  });
});

describe("SettingsPickerRow (S11.3)", () => {
  const options = [
    { value: "b1", label: "B1" },
    { value: "b2", label: "B2" },
    { value: "c1", label: "C1", caveat: "Bientôt disponible", disabled: true },
  ] as const;

  it("opens the option dialog from the trigger and selects an enabled option", () => {
    const onChange = vi.fn();
    render(
      <SettingsPickerRow
        label="Niveau CECR"
        value="b1"
        options={options}
        onChange={onChange}
        testID="picker"
      />
    );
    fireEvent.click(screen.getByTestId("picker-trigger"));
    expect(screen.getByTestId("picker-modal")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("picker-b2"));
    expect(onChange).toHaveBeenCalledWith("b2");
    expect(screen.queryByTestId("picker-modal")).toBeNull(); // closes on select
  });

  it("marks the selected option via aria-checked, highlight and check mark", () => {
    const onChange = vi.fn();
    render(
      <SettingsPickerRow
        label="Niveau CECR"
        value="b1"
        options={options}
        onChange={onChange}
        testID="picker"
      />
    );
    fireEvent.click(screen.getByTestId("picker-trigger"));
    const selectedOption = screen.getByTestId("picker-b1");
    const unselectedOption = screen.getByTestId("picker-b2");
    expect(selectedOption).toHaveAttribute("aria-checked", "true");
    expect(unselectedOption).toHaveAttribute("aria-checked", "false");
    expect(selectedOption.className).toContain("bg-bg-hero");
    expect(unselectedOption.className).not.toContain("bg-bg-hero");
    expect(within(selectedOption).getByText("✓")).toBeInTheDocument();
    expect(within(unselectedOption).queryByText("✓")).toBeNull();
  });

  it("disabled options do not fire onChange and show their caveat", () => {
    const onChange = vi.fn();
    render(
      <SettingsPickerRow
        label="Niveau CECR"
        value="b1"
        options={options}
        onChange={onChange}
        testID="picker"
      />
    );
    fireEvent.click(screen.getByTestId("picker-trigger"));
    expect(screen.getByText("Bientôt disponible")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("picker-c1"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("backdrop click closes without selecting", () => {
    const onChange = vi.fn();
    render(
      <SettingsPickerRow
        label="Niveau CECR"
        value="b1"
        options={options}
        onChange={onChange}
        testID="picker"
      />
    );
    fireEvent.click(screen.getByTestId("picker-trigger"));
    fireEvent.click(screen.getByTestId("picker-backdrop"));
    expect(screen.queryByTestId("picker-modal")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("ConfirmExamChangeModal (S11.3)", () => {
  const base = {
    visible: true,
    title: "Changer d'examen ?",
    subtitle: "Tu passes de B1 à B2.",
    bullets: ["Tes leçons seront réorganisées pour ce nouvel examen."],
    confirmLabel: "Confirmer le changement",
    cancelLabel: "Annuler",
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  };

  it("renders title, subtitle, bullets and fires confirm/cancel", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmExamChangeModal {...base} variant="board" onConfirm={onConfirm} onCancel={onCancel} />
    );
    const modal = screen.getByTestId("settings-confirm-exam-change-modal");
    expect(modal).toHaveAttribute("role", "alertdialog");
    expect(modal).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("Tu passes de B1 à B2.")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("settings-confirm-exam-change-modal-confirm"));
    expect(onConfirm).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByTestId("settings-confirm-exam-change-modal-cancel"));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("board variant's confirm CTA uses bg-warning-red", () => {
    render(<ConfirmExamChangeModal {...base} variant="board" />);
    const confirmButton = screen.getByTestId("settings-confirm-exam-change-modal-confirm");
    expect(confirmButton.className).toContain("bg-warning-red");
    expect(confirmButton.className).not.toContain("bg-text-primary");
  });

  it("level variant's confirm CTA uses bg-text-primary", () => {
    render(<ConfirmExamChangeModal {...base} variant="level" />);
    const confirmButton = screen.getByTestId("settings-confirm-exam-change-modal-confirm");
    expect(confirmButton.className).toContain("bg-text-primary");
    expect(confirmButton.className).not.toContain("bg-warning-red");
  });

  it("moves focus to the dialog card on open", () => {
    render(<ConfirmExamChangeModal {...base} variant="board" />);
    const modal = screen.getByTestId("settings-confirm-exam-change-modal");
    expect(modal).toHaveFocus();
  });

  it("renders nothing when not visible", () => {
    render(<ConfirmExamChangeModal {...base} visible={false} variant="level" />);
    expect(screen.queryByTestId("settings-confirm-exam-change-modal")).toBeNull();
  });
});
