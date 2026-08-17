/**
 * `src/learner/coach/components/ObservationCard.tsx` — web#60 pin.
 *
 * `ObservationCard` takes pre-translated strings as props (no
 * `useTranslation()` inside), so it's rendered with plain
 * `@testing-library/react` `render` rather than `renderWithI18n`.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ObservationCard } from "@/learner/coach/components/ObservationCard";

afterEach(cleanup);

// web#60 — the wrapper used to carry `role="group"` + `aria-label`
// composed from `${overlineLabel}. ${body}` — duplicating the overline
// and body `AppText` children rendered right below it. `role="group"` is
// not children-presentational on web, so a screen reader announced the
// composed name and then re-read those children a second time. This pins
// the wrapper carrying no role or aria-label at all — the children read
// on their own.
describe("ObservationCard", () => {
  it("carries no wrapper role/aria-label — overline and body read naturally, not duplicated", () => {
    render(
      <ObservationCard
        overlineLabel="Observation"
        body="Ta réponse manque de connecteurs logiques."
        connectors={[]}
        testID="observation-card"
      />
    );

    const card = screen.getByTestId("observation-card");
    expect(card).not.toHaveAttribute("role");
    expect(card).not.toHaveAttribute("aria-label");
    expect(screen.getByText("Observation")).toBeInTheDocument();
    expect(screen.getByText("Ta réponse manque de connecteurs logiques.")).toBeInTheDocument();
  });

  it("renders one Chip per connector", () => {
    render(
      <ObservationCard
        overlineLabel="Observation"
        body="Body text."
        connectors={["deshalb", "trotzdem"]}
        testID="observation-card"
      />
    );

    expect(screen.getByTestId("observation-chip-deshalb")).toHaveTextContent("deshalb");
    expect(screen.getByTestId("observation-chip-trotzdem")).toHaveTextContent("trotzdem");
  });
});
