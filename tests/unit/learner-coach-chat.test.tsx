/**
 * `CoachChatScreen` — S9 · Task 9.4.
 *
 * Mocks `@/learner/coach/api` and `@/learner/coach/planApi` at the module
 * level (partial mocks — real `deriveObservation`/`firstSentence`/
 * `deriveConnectors`/`codeForStatus`/etc. stay live so the derived
 * observation/error-code behaviour is exercised for real, only the
 * network-touching functions are stubbed). `next/navigation` and
 * `next-intl` are mocked the same way every other learner screen test
 * mocks them (`learner-sprechen-session.test.tsx`, `learner-coach-hub.test.tsx`).
 */
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  pushMock,
  listCoachThreadsMock,
  loadCoachThreadHistoryMock,
  sendCoachMessageMock,
  getCoachPlanMock,
  trackEventMock,
} = vi.hoisted(() => ({
  pushMock: vi.fn(),
  listCoachThreadsMock: vi.fn(),
  loadCoachThreadHistoryMock: vi.fn(),
  sendCoachMessageMock: vi.fn(),
  getCoachPlanMock: vi.fn(),
  trackEventMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));
vi.mock("next-intl", () => ({ useLocale: () => "fr" }));

vi.mock("@/learner/coach/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/coach/api")>();
  return {
    ...actual,
    listCoachThreads: listCoachThreadsMock,
    loadCoachThreadHistory: loadCoachThreadHistoryMock,
    sendCoachMessage: sendCoachMessageMock,
  };
});

vi.mock("@/learner/coach/planApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/coach/planApi")>();
  return { ...actual, getCoachPlan: getCoachPlanMock };
});

vi.mock("@/learner/core/analytics/posthog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/core/analytics/posthog")>();
  return { ...actual, trackEvent: trackEventMock };
});

import { useLearnerSession } from "@/learner/core/auth/useLearnerSession";
import { __resetCoachOpenerFlagStoreForTests } from "@/learner/coach/hooks/useCoachOpenerFlag";
import { __resetDrillChainStoreForTests } from "@/learner/coach/drillChainStore";
import type { CoachPlanResponse } from "@/learner/coach/planApi";
import { CoachChatScreen } from "@/learner/coach/screens/CoachChatScreen";
import type { CoachMessage } from "@/learner/coach/types";
import { renderWithI18n } from "./helpers/renderWithI18n";

function installMemoryStorage(): void {
  const data: Record<string, string> = {};
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => (k in data ? data[k] : null),
      setItem: (k: string, v: string) => {
        data[k] = v;
      },
      removeItem: (k: string) => {
        delete data[k];
      },
    } as unknown as Storage,
  });
}

function setOnline(value: boolean): void {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value,
  });
}

function samplePlan(overrides: Partial<CoachPlanResponse> = {}): CoachPlanResponse {
  return {
    planMarkdown: "",
    grammarDeepLinks: [],
    modelVersion: null,
    promptVersion: "v1",
    generatedAt: "2026-08-08T00:00:00.000Z",
    replay: false,
    drills: [],
    ...overrides,
  };
}

function sampleMessage(overrides: Partial<CoachMessage> = {}): CoachMessage {
  return {
    id: "m1",
    role: "assistant",
    text: "Hallo",
    createdAt: "2026-08-08T09:00:00.000Z",
    status: "complete",
    ...overrides,
  };
}

async function waitForReady(): Promise<void> {
  await waitFor(() =>
    expect(screen.queryByTestId("coach-chat-loading-indicator")).not.toBeInTheDocument()
  );
}

describe("CoachChatScreen (S9 Task 9.4)", () => {
  beforeEach(() => {
    installMemoryStorage();
    setOnline(true);
    __resetCoachOpenerFlagStoreForTests();
    __resetDrillChainStoreForTests();
    pushMock.mockReset();
    listCoachThreadsMock.mockReset().mockResolvedValue([]);
    loadCoachThreadHistoryMock.mockReset().mockResolvedValue([]);
    sendCoachMessageMock.mockReset();
    getCoachPlanMock.mockReset().mockResolvedValue(samplePlan());
    trackEventMock.mockReset();
    useLearnerSession.setState({
      session: { user: { id: "u1" } },
      status: "authenticated",
    } as never);
  });

  afterEach(() => {
    cleanup();
  });

  it("resolves the route thread id and renders its history", async () => {
    loadCoachThreadHistoryMock.mockResolvedValue([
      sampleMessage({ id: "m1", role: "user", text: "Hallo" }),
      sampleMessage({ id: "m2", role: "assistant", text: "Guten Tag" }),
    ]);

    renderWithI18n(<CoachChatScreen routeThreadId="t1" />);
    await waitForReady();

    expect(loadCoachThreadHistoryMock).toHaveBeenCalledWith("t1");
    expect(screen.getByTestId("coach-message-m1")).toBeInTheDocument();
    expect(screen.getByTestId("coach-message-m2")).toBeInTheDocument();
  });

  it("resumes the most recent thread when no route param is given", async () => {
    listCoachThreadsMock.mockResolvedValue([
      {
        threadId: "latest",
        preview: "hi",
        messageCount: 2,
        startedAt: "2026-08-08T00:00:00.000Z",
        lastMessageAt: "2026-08-08T00:00:00.000Z",
      },
    ]);
    loadCoachThreadHistoryMock.mockResolvedValue([
      sampleMessage({ id: "m1", role: "assistant", text: "Willkommen zurück" }),
    ]);

    renderWithI18n(<CoachChatScreen />);
    await waitForReady();

    expect(loadCoachThreadHistoryMock).toHaveBeenCalledWith("latest");
    expect(screen.getByTestId("coach-message-m1")).toBeInTheDocument();
  });

  it("falls back to a fresh local thread with a usable composer when resolution throws — no error UI (mobile parity)", async () => {
    listCoachThreadsMock.mockRejectedValue(new Error("coach_threads_fetch_failed"));

    renderWithI18n(<CoachChatScreen />);
    await waitForReady();

    expect(screen.queryByTestId("coach-chat-error-banner")).not.toBeInTheDocument();
    expect(screen.getByTestId("coach-chat-input")).not.toBeDisabled();
    expect(screen.getByTestId("coach-chat-send")).not.toBeDisabled();
  });

  it("shows the scripted opener + observation + drill CTA on a fresh empty thread when the plan has signal", async () => {
    getCoachPlanMock.mockResolvedValue(
      samplePlan({
        planMarkdown: "Du machst gute Fortschritte. Nutze mehr Konnektoren wie trotzdem.",
        grammarDeepLinks: [{ label: "trotzdem" }],
      })
    );

    renderWithI18n(<CoachChatScreen />);
    await waitForReady();

    await waitFor(() =>
      expect(screen.getByTestId("coach-message-scripted-coach-opener")).toBeInTheDocument()
    );
    expect(screen.getByTestId("coach-chat-observation-scripted-observation")).toBeInTheDocument();
    expect(screen.getByTestId("coach-chat-drill-cta-scripted-drill-cta")).toBeInTheDocument();
  });

  it("omits the observation card + drill CTA when the plan has no signal", async () => {
    // Default samplePlan() has an empty planMarkdown -> hasSignal:false.
    renderWithI18n(<CoachChatScreen />);
    await waitForReady();

    await waitFor(() =>
      expect(screen.getByTestId("coach-message-scripted-coach-opener")).toBeInTheDocument()
    );
    expect(
      screen.queryByTestId("coach-chat-observation-scripted-observation")
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("coach-chat-drill-cta-scripted-drill-cta")).not.toBeInTheDocument();
  });

  it("shows the fallback banner when the coach plan fails to load", async () => {
    getCoachPlanMock.mockRejectedValue(new Error("coach_plan_failed"));

    renderWithI18n(<CoachChatScreen />);
    await waitForReady();

    await waitFor(() =>
      expect(screen.getByTestId("coach-chat-fallback-banner")).toBeInTheDocument()
    );
  });

  it("locks the composer for 30s on a coach_rate_limited send failure, then releases it", async () => {
    sendCoachMessageMock.mockRejectedValue(new Error("coach_rate_limited"));

    renderWithI18n(<CoachChatScreen routeThreadId="t1" />);
    await waitForReady();

    const input = screen.getByTestId("coach-chat-input");
    fireEvent.change(input, { target: { value: "Hallo Betreuer" } });

    // Fake timers installed BEFORE the click that triggers the rejected
    // send + the countdown's `setInterval` — an interval created under
    // real timers (click first, fake timers after) never observes a
    // later `advanceTimersByTimeAsync` call, since vitest's fake clock
    // only controls timers scheduled after activation.
    vi.useFakeTimers();
    fireEvent.click(screen.getByTestId("coach-chat-send"));
    // Flush the rejected-promise microtask chain inside `send()` so the
    // countdown state (and its interval) is actually created before we
    // assert on it.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByTestId("coach-chat-error-banner")).toHaveTextContent("30 s");
    expect(input).toBeDisabled();
    expect(screen.getByTestId("coach-chat-send")).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000);
    });
    vi.useRealTimers();

    expect(screen.queryByTestId("coach-chat-error-banner")).not.toBeInTheDocument();
    expect(input).not.toBeDisabled();
  });

  it("blocks the transport when offline, shows coach_offline, and fires a duration_ms:0 offline outcome (no coach_message_sent)", async () => {
    renderWithI18n(<CoachChatScreen routeThreadId="t1" />);
    await waitForReady();

    setOnline(false);
    await act(async () => {
      window.dispatchEvent(new Event("offline"));
    });

    const input = screen.getByTestId("coach-chat-input");
    fireEvent.change(input, { target: { value: "Hallo Betreuer" } });
    fireEvent.click(screen.getByTestId("coach-chat-send"));

    expect(sendCoachMessageMock).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId("coach-chat-error-banner")).toBeInTheDocument());

    expect(trackEventMock).toHaveBeenCalledWith("coach_message_received", {
      thread_id: "t1",
      duration_ms: 0,
      outcome: "offline",
    });
    expect(
      trackEventMock.mock.calls.some(([name]) => name === "coach_message_sent")
    ).toBe(false);
  });

  it("fires coach_message_sent then coach_message_received{outcome:success} on a successful submit", async () => {
    sendCoachMessageMock.mockResolvedValue({
      messageId: "reply-1",
      text: "Guten Tag!",
      createdAt: "2026-08-08T09:05:00.000Z",
    });

    renderWithI18n(<CoachChatScreen routeThreadId="t1" />);
    await waitForReady();

    const input = screen.getByTestId("coach-chat-input");
    fireEvent.change(input, { target: { value: "Hallo Betreuer" } });
    fireEvent.click(screen.getByTestId("coach-chat-send"));

    await waitFor(() => expect(sendCoachMessageMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText("Guten Tag!")).toBeInTheDocument());

    const sentIndex = trackEventMock.mock.calls.findIndex(([name]) => name === "coach_message_sent");
    const receivedIndex = trackEventMock.mock.calls.findIndex(
      ([name, props]) =>
        name === "coach_message_received" &&
        (props as { outcome?: string })?.outcome === "success"
    );
    expect(sentIndex).toBeGreaterThanOrEqual(0);
    expect(receivedIndex).toBeGreaterThan(sentIndex);
    expect(trackEventMock.mock.calls[sentIndex]?.[1]).toEqual({
      thread_id: "t1",
      message_length: "Hallo Betreuer".length,
    });
  });
});
