import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SRSClozeCard } from "../../src/learner/ui/blocks/SRSClozeCard";
import { SRSOptionChipRow, type SRSOption } from "../../src/learner/ui/blocks/SRSOptionChipRow";
import { SRSExplanationPanel } from "../../src/learner/ui/blocks/SRSExplanationPanel";
import { DifficultyActionRow } from "../../src/learner/ui/blocks/DifficultyActionRow";
import { SRSProgressFooter } from "../../src/learner/ui/blocks/SRSProgressFooter";

afterEach(() => {
  cleanup();
});

const OPTIONS: readonly SRSOption[] = [
  { id: "o1", label: "weil", isCorrect: true },
  { id: "o2", label: "obwohl", isCorrect: false },
];

describe("SRSClozeCard", () => {
  it("renders subject overline, instruction, due pill and translation", () => {
    render(
      <SRSClozeCard
        testID="cloze"
        dueLabel="Dû depuis 2j"
        subjectLabel="Connecteurs B1"
        instructionLabel="Complétez"
        clozeSentence={<span>Ich bleibe zu Hause, ____ es regnet.</span>}
        translation="Je reste à la maison parce qu'il pleut."
      />
    );
    expect(screen.getByTestId("cloze")).toHaveTextContent("Connecteurs B1");
    expect(screen.getByTestId("cloze-due")).toHaveTextContent("Dû depuis 2j");
    expect(screen.getByTestId("cloze")).toHaveTextContent("Complétez");
    expect(screen.getByTestId("cloze")).toHaveTextContent(
      "« Je reste à la maison parce qu'il pleut. »"
    );
  });
});

describe("SRSOptionChipRow", () => {
  it("marks the correct option with a check suffix when revealed and fires onSelect", () => {
    const onSelect = vi.fn();
    render(<SRSOptionChipRow testID="opts" options={OPTIONS} revealed onSelect={onSelect} />);
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(2);
    expect(radios[0]).toHaveTextContent("weil ✓");
    fireEvent.click(radios[1]!);
    expect(onSelect).toHaveBeenCalledWith("o2");
  });
});

describe("SRSExplanationPanel", () => {
  it("renders overline + body", () => {
    render(<SRSExplanationPanel testID="why" overlineLabel="Pourquoi ?" body="Règle." />);
    expect(screen.getByTestId("why")).toHaveTextContent("Pourquoi ?");
    expect(screen.getByTestId("why")).toHaveTextContent("Règle.");
  });
});

describe("DifficultyActionRow", () => {
  const labels = { again: "À revoir", hard: "Difficile", good: "Bien", easy: "Facile" };

  it("renders 4 buttons in again/hard/good/easy order and fires onSelect", () => {
    const onSelect = vi.fn();
    render(<DifficultyActionRow testID="diff" labels={labels} onSelect={onSelect} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["À revoir", "Difficile", "Bien", "Facile"]);
    fireEvent.click(buttons[2]!);
    expect(onSelect).toHaveBeenCalledWith("good");
  });

  it("blocks clicks when disabled", () => {
    const onSelect = vi.fn();
    render(<DifficultyActionRow testID="diff" labels={labels} onSelect={onSelect} disabled />);
    fireEvent.click(screen.getAllByRole("button")[0]!);
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe("SRSProgressFooter", () => {
  it("renders both labels and a progressbar at the right fraction", () => {
    render(
      <SRSProgressFooter
        testID="footer"
        currentIndex={1}
        total={4}
        positionLabel="Carte 1 / 4"
        remainingLabel="4 restantes"
      />
    );
    expect(screen.getByTestId("footer")).toHaveTextContent("Carte 1 / 4");
    expect(screen.getByTestId("footer")).toHaveTextContent("4 restantes");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "25");
  });
});
