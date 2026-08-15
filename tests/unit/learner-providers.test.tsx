/**
 * `LearnerProviders` — onboarding-answers reset on sign-out (S13 Task 7,
 * M-2.11).
 *
 * `useOnboardingAnswers` (`src/learner/onboarding/state/useOnboardingAnswers.ts`)
 * is a session-local zustand store with no per-user namespacing. Before
 * this fix, nothing cleared it on sign-out, so a second user signing in on
 * the same tab (no full page reload — this is an SPA) inherited the first
 * user's `motivation`/`schedule` answers into their own `finish()` call.
 *
 * This test drives the REAL `useLearnerSession` store through the
 * `authenticated -> unauthenticated` transition (mirrors the sign-out
 * path `LearnerProviders`'s `[status, userId]` effect actually observes)
 * rather than calling `useOnboardingAnswers.getState().reset()` directly,
 * so it would fail if the reset call were removed from the effect.
 *
 * Every other module `LearnerProviders` touches is mocked to a no-op —
 * this test is only about the onboarding-answers side effect, not the
 * readiness/analytics/prefetch machinery already covered elsewhere
 * (`learner-prefetch-on-login.test.ts`, `learner-readiness-hydrate.test.ts`,
 * `learner-ack-adapter.test.ts`).
 */
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useLocale: () => "fr" }));

const { identifyUserMock, resetAnalyticsUserMock } = vi.hoisted(() => ({
  identifyUserMock: vi.fn(),
  resetAnalyticsUserMock: vi.fn(),
}));
vi.mock("@/learner/core/analytics/posthog", () => ({
  identifyUser: identifyUserMock,
  initPostHog: vi.fn(),
  resetAnalyticsUser: resetAnalyticsUserMock,
}));

vi.mock("@/learner/core/content/usePrefetchOnLogin", () => ({
  usePrefetchOnLogin: vi.fn(),
}));

const { clearReadinessMock } = vi.hoisted(() => ({ clearReadinessMock: vi.fn() }));
vi.mock("@/learner/core/readiness", () => ({ clearReadiness: clearReadinessMock }));

vi.mock("@/learner/core/readiness/hydrate", () => ({
  hydrateOnBoot: vi.fn().mockResolvedValue(undefined),
  subscribeForegroundHydration: vi.fn(() => vi.fn()),
}));

vi.mock("@/learner/core/submissions/installAcknowledgeAdapter", () => ({
  installAcknowledgeAdapter: vi.fn(() => vi.fn()),
}));
vi.mock("@/learner/core/submissions/installPollingAdapter", () => ({
  installPollingAdapter: vi.fn(() => vi.fn()),
}));

vi.mock("@/learner/core/auth/useLearnerSession", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/core/auth/useLearnerSession")>();
  return { ...actual, bootstrapLearnerSession: vi.fn().mockResolvedValue(undefined) };
});

import { LearnerProviders } from "@/learner/core/LearnerProviders";
import { useLearnerSession } from "@/learner/core/auth/useLearnerSession";
import { useOnboardingAnswers } from "@/learner/onboarding/state/useOnboardingAnswers";

const EMPTY = { motivation: null, schedule: null };

function setSession(userId: string | null): void {
  useLearnerSession.setState({
    session: (userId ? { user: { id: userId } } : null) as never,
    status: userId ? "authenticated" : "unauthenticated",
  });
}

afterEach(() => {
  cleanup();
});

describe("LearnerProviders — onboarding answers reset on sign-out", () => {
  beforeEach(() => {
    identifyUserMock.mockReset();
    resetAnalyticsUserMock.mockReset();
    clearReadinessMock.mockReset();
    useOnboardingAnswers.setState(EMPTY);
    setSession(null);
  });

  it("clears useOnboardingAnswers when the session effect drives unauthenticated after a real sign-out", async () => {
    setSession("user-1");
    render(
      <LearnerProviders>
        <div>content</div>
      </LearnerProviders>
    );
    await act(async () => {});

    // Seed the store the way the onboarding wizard would — a second user
    // on this device must never see these on their own run.
    act(() => {
      useOnboardingAnswers.getState().setMotivation("travel");
      useOnboardingAnswers.getState().setSchedule("10");
    });
    expect(useOnboardingAnswers.getState()).toMatchObject({ motivation: "travel", schedule: "10" });

    // Drive the actual sign-out path: flip the real session store to
    // "unauthenticated", the same transition useLearnerSession.signOut()
    // (or a SIGNED_OUT auth-state event) produces.
    act(() => setSession(null));
    await act(async () => {});

    expect(useOnboardingAnswers.getState()).toMatchObject(EMPTY);
  });

  it("never authenticating in this tab leaves the (already-empty) store untouched", async () => {
    render(
      <LearnerProviders>
        <div>content</div>
      </LearnerProviders>
    );
    await act(async () => {});
    expect(useOnboardingAnswers.getState()).toMatchObject(EMPTY);
  });
});
