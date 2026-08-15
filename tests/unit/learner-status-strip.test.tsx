import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const trackEvent = vi.fn();
vi.mock("@/learner/core/analytics/posthog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/core/analytics/posthog")>();
  return { ...actual, trackEvent: (...a: unknown[]) => trackEvent(...a) };
});

import { initLearnerI18n } from "@/learner/core/i18n";
import { LearnerI18nProvider } from "@/learner/core/i18n/LearnerI18nProvider";
import { StatusStrip } from "@/learner/accueil/components/StatusStrip";
import { PriorityTaskCard } from "@/learner/accueil/components/PriorityTaskCard";
import type { ReadinessSignal } from "@/learner/core/readiness";

afterEach(cleanup);
beforeAll(() => initLearnerI18n("fr"));
beforeEach(() => trackEvent.mockClear());
const ui = (node: React.ReactNode) =>
  render(<LearnerI18nProvider lng="fr">{node}</LearnerI18nProvider>);

const slot = (over: Partial<ReadinessSignal>): ReadinessSignal => ({
  submissionId: "s1",
  module: "schreiben",
  state: "in-flight",
  startedAt: 0,
  ...over,
});

describe("StatusStrip", () => {
  it("hidden on null slot; in-flight renders non-interactive copy + emits strip_shown once", () => {
    const { rerender } = ui(<StatusStrip _signal={null} _now={() => 0} />);
    expect(screen.queryByTestId("status-strip")).toBeNull();
    rerender(
      <LearnerI18nProvider lng="fr">
        <StatusStrip _signal={slot({})} _now={() => 0} />
      </LearnerI18nProvider>
    );
    expect(screen.getByTestId("status-strip")).toBeInTheDocument();
    expect(screen.queryByTestId("status-strip-press")).toBeNull();
    expect(trackEvent).toHaveBeenCalledWith("strip_shown", {
      submission_id: "s1",
      module: "schreiben",
    });
    rerender(
      <LearnerI18nProvider lng="fr">
        <StatusStrip _signal={slot({ slow: true })} _now={() => 0} />
      </LearnerI18nProvider>
    );
    expect(trackEvent).toHaveBeenCalledTimes(1); // once per slot
  });

  it("ready state is interactive, fires onReady + strip_ready with latency", () => {
    const onReady = vi.fn();
    let now = 1_000;
    const { rerender } = ui(<StatusStrip _signal={slot({})} _now={() => now} onReady={onReady} />);
    now = 4_500;
    rerender(
      <LearnerI18nProvider lng="fr">
        <StatusStrip _signal={slot({ state: "ready" })} _now={() => now} onReady={onReady} />
      </LearnerI18nProvider>
    );
    expect(trackEvent).toHaveBeenCalledWith("strip_ready", {
      submission_id: "s1",
      module: "schreiben",
      latency_ms_since_strip_shown: 3_500,
    });
    fireEvent.click(screen.getByTestId("status-strip-press"));
    expect(onReady).toHaveBeenCalledWith(
      expect.objectContaining({ submissionId: "s1", state: "ready" })
    );
  });

  it("failed state fires onRetry", () => {
    const onRetry = vi.fn();
    ui(
      <StatusStrip
        _signal={slot({ state: "failed", failedReason: "grader" })}
        _now={() => 0}
        onRetry={onRetry}
      />
    );
    fireEvent.click(screen.getByTestId("status-strip-press"));
    expect(onRetry).toHaveBeenCalled();
  });
});

describe("PriorityTaskCard", () => {
  const props = {
    priorityLabel: "Priorité",
    skill: "Sprachbausteine",
    title: "Exercices du jour",
    subtitle: "4 exercices ciblés",
    body: "corps",
    ctaLabel: "Commencer",
    durationLabel: "10 min",
    onCtaPress: vi.fn(),
  };
  it("active branch composes 'CTA · duration' and is enabled (S9 Task 9.6 wired the drill session)", () => {
    ui(<PriorityTaskCard {...props} testID="pt" />);
    const cta = screen.getByTestId("pt-cta");
    expect(cta).toHaveTextContent("Commencer · 10 min");
    expect(cta).not.toBeDisabled();
  });
  it("empty branch renders the calm placeholder with a disabled CTA", () => {
    ui(
      <PriorityTaskCard
        {...props}
        empty={{ title: "Rien à corriger", body: "b", ctaLabel: "c" }}
        testID="pt"
      />
    );
    expect(screen.getByText("Rien à corriger")).toBeInTheDocument();
    expect(screen.getByTestId("pt-empty-cta")).toBeDisabled();
  });

  // S13 final-fixes finding 2 (whole-branch review): the card root is
  // never itself interactive (no role="button"/tabIndex — the inner CTA
  // button is the single focusable control) and must NOT carry a
  // role="group" aria-label composed from the descendants' own text
  // either. `role="group"` is not children-presentational the way a
  // native `accessible` View is — a screen reader announces the group's
  // composed name AND THEN re-reads every descendant text node, so a
  // label that just restates the visible children doubles the
  // announcement. The children already expose the same text as
  // independently-readable nodes, in the same order, so no wrapper
  // accessible name is needed at all.
  it("active branch: card root has no role=button/tabIndex/role=group — content reads naturally without a duplicated summary; the CTA is the single focusable control", () => {
    ui(<PriorityTaskCard {...props} testID="pt" />);
    const card = screen.getByTestId("pt");
    expect(card).not.toHaveAttribute("role", "button");
    expect(card).not.toHaveAttribute("tabIndex");
    expect(card).not.toHaveAttribute("role");
    expect(card).not.toHaveAttribute("aria-label");
    expect(screen.getByText(props.title)).toBeInTheDocument();
    expect(screen.getByTestId("pt-cta").tagName).toBe("BUTTON");
  });

  it("empty branch: card root carries no duplicated role=group summary either — content reads naturally", () => {
    ui(
      <PriorityTaskCard
        {...props}
        empty={{ title: "Rien à corriger", body: "b", ctaLabel: "c" }}
        testID="pt"
      />
    );
    const card = screen.getByTestId("pt");
    expect(card).not.toHaveAttribute("role");
    expect(card).not.toHaveAttribute("aria-label");
    expect(screen.getByText("Rien à corriger")).toBeInTheDocument();
  });
});
