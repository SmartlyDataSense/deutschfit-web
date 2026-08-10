import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n } from "./helpers/renderWithI18n";
import { ApprendreScreen } from "../../src/learner/practice/screens/ApprendreScreen";

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("next-intl", () => ({ useLocale: () => "fr" }));

beforeEach(() => {
  pushMock.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("Apprendre — Révision (SRS) skill card", () => {
  it("is active (no 'Bientôt disponible') and routes to /fr/app/srs", () => {
    renderWithI18n(<ApprendreScreen />);
    expect(screen.queryByTestId("apprendre-card-srs-coming-soon")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("apprendre-card-srs"));
    expect(pushMock).toHaveBeenCalledWith("/fr/app/srs");
  });
});
