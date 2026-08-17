/**
 * `src/learner/practice/screens/ApprendreScreen.tsx` — web#60 pin for the
 * disabled ("Bientôt disponible") skill-card branch.
 *
 * Every card in the real `skillCards` fixture (`../data/cards`) is
 * currently `active: true`, so the disabled branch is unreachable
 * against the real data as of this task — mock the module to force one
 * card `active: false` and exercise it directly.
 */
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWithI18n } from "./helpers/renderWithI18n";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("next-intl", () => ({ useLocale: () => "fr" }));
vi.mock("../../src/learner/practice/data/cards", () => ({
  skillCards: [{ id: "schreiben", active: false }],
}));

import { ApprendreScreen } from "../../src/learner/practice/screens/ApprendreScreen";

afterEach(cleanup);

// web#60 — the disabled-card wrapper used to pair `role="group"` +
// `aria-disabled="true"` with a composed `aria-label={\`${title} –
// ${comingSoonLabel}\`}` — duplicating the title `AppText` and "Bientôt
// disponible" `Chip` already rendered inside it. `role="group"` is not
// children-presentational on web, so a screen reader announced the
// composed name and then re-read those children a second time. This pins
// the wrapper keeping `role="group"`/`aria-disabled` (needed so
// `aria-disabled` reliably exposes on a plain `<div>`) but carrying NO
// aria-label — the title and "Bientôt disponible" chip read on their own.
describe("ApprendreScreen — disabled skill card", () => {
  it("keeps role=group + aria-disabled but carries no composed aria-label — title and chip read naturally", () => {
    renderWithI18n(<ApprendreScreen />);

    const card = screen.getByTestId("apprendre-card-schreiben");
    expect(card).toHaveAttribute("role", "group");
    expect(card).toHaveAttribute("aria-disabled", "true");
    expect(card).not.toHaveAttribute("aria-label");
    expect(screen.getByText("Schreiben")).toBeInTheDocument();
    expect(screen.getByTestId("apprendre-card-schreiben-coming-soon")).toHaveTextContent(
      "Bientôt disponible"
    );
  });
});
