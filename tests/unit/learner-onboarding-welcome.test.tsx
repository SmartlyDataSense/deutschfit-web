import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }) }));
vi.mock("next-intl", () => ({ useLocale: () => "fr" }));

import { initLearnerI18n } from "@/learner/core/i18n";
import { LearnerI18nProvider } from "@/learner/core/i18n/LearnerI18nProvider";
import { BrandMark } from "@/learner/ui/primitives";
import { WelcomeScreen } from "@/learner/onboarding/screens/WelcomeScreen";

// vitest.config.ts runs with `globals: false`, so @testing-library/react's
// auto-cleanup (which detects a global `afterEach`) never registers. Both
// `WelcomeScreen` tests render the same testIDs, so without an explicit
// cleanup the second render's query matches two elements. See
// `tests/unit/learner-primitives.test.tsx` for the established pattern.
afterEach(cleanup);

beforeAll(() => {
  initLearnerI18n("fr");
});

const ui = (node: React.ReactNode) => render(<LearnerI18nProvider lng="fr">{node}</LearnerI18nProvider>);

describe("BrandMark", () => {
  it("renders the tone-matched monogram at the requested size", () => {
    render(<BrandMark tone="onCream" size={28} testID="bm" />);
    const img = screen.getByTestId("bm");
    expect(img).toHaveAttribute("src", "/brand/monogram-dark.png"); // dark mark on cream surfaces
    expect(img).toHaveAttribute("width", "28");
    expect(img).toHaveAttribute("alt", "DeutschFit");
  });
});

describe("WelcomeScreen (mock #1 parity)", () => {
  it("renders brand row, hero copy, teaser card and CTA from onboarding:welcome.*", () => {
    ui(<WelcomeScreen />);
    expect(screen.getByTestId("onboarding-welcome-brandmark")).toBeInTheDocument();
    expect(screen.getByTestId("onboarding-welcome-title")).toBeInTheDocument();
    expect(screen.getByTestId("onboarding-welcome-teaser")).toBeInTheDocument();
    expect(screen.getByTestId("onboarding-welcome-teaser-progress")).toBeInTheDocument();
    expect(screen.getByTestId("onboarding-welcome-cta")).toBeInTheDocument();
  });

  it("CTA navigates to the exam-type step", async () => {
    ui(<WelcomeScreen />);
    screen.getByTestId("onboarding-welcome-cta").click();
    expect(push).toHaveBeenCalledWith("/fr/app/onboarding/exam-type");
  });
});
