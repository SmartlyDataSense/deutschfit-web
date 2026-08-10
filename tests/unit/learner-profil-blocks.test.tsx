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
    expect(screen.getByText("B1")).toBeInTheDocument();
  });

  it("warning tone hides the chevron; disabled blocks the click", () => {
    const onClick = vi.fn();
    render(
      <>
        <SettingsRow label="Supprimer" tone="warning" onClick={onClick} testID="row-warn" />
        <SettingsRow label="Off" disabled onClick={onClick} testID="row-off" />
      </>
    );
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

  it("disabled options do not fire onChange and show their caveat", () => {
    const onChange = vi.fn();
    render(
      <SettingsPickerRow label="Niveau CECR" value="b1" options={options} onChange={onChange} testID="picker" />
    );
    fireEvent.click(screen.getByTestId("picker-trigger"));
    expect(screen.getByText("Bientôt disponible")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("picker-c1"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("backdrop click closes without selecting", () => {
    const onChange = vi.fn();
    render(
      <SettingsPickerRow label="Niveau CECR" value="b1" options={options} onChange={onChange} testID="picker" />
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
    expect(screen.getByText("Tu passes de B1 à B2.")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("settings-confirm-exam-change-modal-confirm"));
    expect(onConfirm).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByTestId("settings-confirm-exam-change-modal-cancel"));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("renders nothing when not visible", () => {
    render(<ConfirmExamChangeModal {...base} visible={false} variant="level" />);
    expect(screen.queryByTestId("settings-confirm-exam-change-modal")).toBeNull();
  });
});
