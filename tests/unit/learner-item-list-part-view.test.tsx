/**
 * `src/learner/practice/components/ItemListPartView.tsx` — web#60 pin.
 *
 * Per-item wrapper `role="group"`/`aria-label` is conditional on
 * `item.stem`: when a stem exists it renders as its own `AppText`, so
 * pairing the group with `aria-label={item.stem}` would duplicate it
 * (dropped). When `item.stem` is null, that whole stem row doesn't
 * render at all, so the item number isn't otherwise visible anywhere in
 * the group — the fallback `role="group"`/`aria-label={item.number}` is
 * kept there (same shape as the do-not-touch `PracticeSessionScreen` /
 * `TopicPickerScreen` groups).
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ItemListPartView } from "@/learner/practice/components/ItemListPartView";
import type { ExamItem, ExamPart } from "@/learner/core/exam/engine/types";

afterEach(cleanup);

function makePart(items: readonly ExamItem[]): ExamPart {
  return {
    id: "part-1",
    teilNumber: 1,
    label: "Teil 1",
    partKind: "GLOBALVERSTEHEN",
    durationMinutes: 10,
    instructions: "",
    items,
  };
}

const itemWithStem: ExamItem = {
  id: "i1",
  number: 1,
  stem: "Wo wohnt Marie?",
  answerFormat: "MC_SINGLE_3",
  options: [
    { key: "a", text: "Berlin" },
    { key: "b", text: "München" },
    { key: "c", text: "Köln" },
  ],
  correctKey: "a",
  stimulusSlug: null,
};

const itemWithoutStem: ExamItem = {
  ...itemWithStem,
  id: "i2",
  number: 2,
  stem: null,
};

describe("ItemListPartView — per-item wrapper role/aria-label", () => {
  it("carries no wrapper role/aria-label when item.stem is set — the stem AppText reads on its own", () => {
    render(<ItemListPartView part={makePart([itemWithStem])} locks={{}} onPick={vi.fn()} />);

    const group = screen.getByTestId("practice-item-i1");
    expect(group).not.toHaveAttribute("role");
    expect(group).not.toHaveAttribute("aria-label");
    expect(screen.getByText("Wo wohnt Marie?")).toBeInTheDocument();
  });

  it("keeps role=group + aria-label={item.number} when item.stem is null — no visible number elsewhere to duplicate", () => {
    render(<ItemListPartView part={makePart([itemWithoutStem])} locks={{}} onPick={vi.fn()} />);

    const group = screen.getByTestId("practice-item-i2");
    expect(group).toHaveAttribute("role", "group");
    expect(group).toHaveAttribute("aria-label", "2");
    // The stem row (which is the only place the item number is otherwise
    // rendered) is entirely absent — confirms nothing duplicates the label.
    expect(screen.queryByText("2.")).not.toBeInTheDocument();
  });
});
