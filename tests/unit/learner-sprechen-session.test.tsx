/**
 * `SprechenSessionScreen` — S7 · Task 7.8.
 *
 * Every native/browser dependency is injected through the screen's test
 * seams (`sessionDeps`, `recorderFactory`, `micCheckNativeFactory`) rather
 * than mocked at the module level — same idiom as
 * `learner-sprechen-session-hook.test.ts` for the session deps, and the
 * mobile-parity injectable-factory contract for the recorder / mic check.
 * `LocalAudioPlayer` is mocked to a plain stub that surfaces its `uri`
 * prop as a `data-uri` attribute so the F-028 stop-return-uri test can
 * assert on it without needing real `<audio>` playback in jsdom.
 */
import { StrictMode } from "react";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `vi.hoisted` — mock factories are hoisted above the rest of the module.
const {
  pushMock,
  replaceMock,
  hydrateExamContextMock,
  fetchTopicsMock,
  trackEventMock,
  markSubmissionInFlightMock,
  acknowledgeReadinessMock,
} = vi.hoisted(() => ({
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
  hydrateExamContextMock: vi.fn(),
  fetchTopicsMock: vi.fn(),
  trackEventMock: vi.fn(),
  markSubmissionInFlightMock: vi.fn(),
  acknowledgeReadinessMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
}));
vi.mock("next-intl", () => ({ useLocale: () => "fr" }));

// Constraint 15 — feature code imports wire fns only from the `examApi`
// facade. Partial mock: keep every real export (types, other functions)
// except `fetchTopics`, which the screen's P18 miss-path calls directly.
vi.mock("@/learner/core/api/examApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/core/api/examApi")>();
  return { ...actual, fetchTopics: fetchTopicsMock };
});

// Partial mock: keep the real `useExamContextStore` (driven directly via
// `setState`) but stub `hydrateExamContext` so the screen's self-hydrate
// mount effect doesn't hit real localStorage/Supabase in jsdom — same
// idiom as `SchreibenEditorScreen`'s test.
vi.mock("@/learner/core/exam/examContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/core/exam/examContext")>();
  return { ...actual, hydrateExamContext: hydrateExamContextMock };
});

vi.mock("@/learner/core/readiness", () => ({
  markSubmissionInFlight: (...args: unknown[]) => markSubmissionInFlightMock(...args),
  acknowledgeReadiness: (...args: unknown[]) => acknowledgeReadinessMock(...args),
}));

vi.mock("@/learner/core/analytics/posthog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/core/analytics/posthog")>();
  return { ...actual, trackEvent: trackEventMock };
});

// Stub the replay control — the F-028 assertion reads the `uri` prop it
// was handed straight off a `data-uri` attribute instead of driving the
// real `useAudioReplay` playback machine (no `<audio>` support in jsdom).
vi.mock("@/learner/sprechen/components/LocalAudioPlayer", () => ({
  LocalAudioPlayer: ({ uri }: { uri: string }) => (
    <div data-testid="sprechen-session-review-player" data-uri={uri} />
  ),
}));

import { useExamContextStore } from "@/learner/core/exam/examContext";
import type { SprechenSubmission, TopicCard } from "@/learner/core/api/examApi";
import type { NativeMicCheck } from "@/learner/sprechen/hooks/useMicCheck";
import type { NativeRecorder } from "@/learner/sprechen/hooks/useRecorder";
import type { SprechenSessionDeps } from "@/learner/sprechen/hooks/useSprechenSession";
import type { SprechenPollingSnapshot } from "@/learner/sprechen/hooks/useSprechenSubmissionPolling";
import { LEARNER_MIC_CHECK_PASSED_KEY } from "@/learner/core/storage/flags";
import { __resetMicCheckFlagStoreForTests } from "@/learner/sprechen/hooks/useMicCheckFlag";
import { SprechenSessionScreen } from "@/learner/sprechen/screens/SprechenSessionScreen";
import { useTopicHandoff } from "@/learner/sprechen/topicHandoffStore";
import { renderWithI18n } from "./helpers/renderWithI18n";

function installLocalStorageMock(): void {
  let store = new Map<string, string>();
  const mock: Storage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store = new Map();
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(window, "localStorage", {
    value: mock,
    configurable: true,
    writable: true,
  });
}

function sampleTopic(overrides: Partial<TopicCard> = {}): TopicCard {
  return {
    id: "topic-1",
    subgenre: "praesentation",
    level: "B1",
    titleDe: "Meine Stadt",
    subtitleFr: "Présente ta ville.",
    outlineSteps: [
      { order: 1, de: "Einleitung", fr: "Introduction" },
      { order: 2, de: "Hauptteil", fr: null },
    ],
    cert: "GOETHE",
    ...overrides,
  };
}

/** Fake `NativeRecorder` — never touches MediaRecorder/getUserMedia. */
function makeFakeRecorder(overrides: Partial<NativeRecorder> = {}): NativeRecorder & {
  stopRecordingMock: ReturnType<typeof vi.fn>;
} {
  const stopRecordingMock = vi
    .fn()
    .mockResolvedValue({ uri: "blob:recorded-uri", durationMs: 32_000 });
  return {
    requestPermissions: vi.fn().mockResolvedValue({ granted: true }),
    startRecording: vi.fn().mockResolvedValue(undefined),
    stopRecording: stopRecordingMock,
    pollStatus: vi.fn().mockReturnValue({ durationMs: 0, metering: -10 }),
    stopRecordingMock,
    ...overrides,
  };
}

/** Fake `NativeMicCheck` — instant grant/record/playback, no real Audio(). */
function makeFakeMicCheck(overrides: Partial<NativeMicCheck> = {}): NativeMicCheck {
  return {
    requestPermissions: vi.fn().mockResolvedValue({ granted: true }),
    startRecording: vi.fn().mockResolvedValue(undefined),
    stopRecording: vi.fn().mockResolvedValue({ uri: "blob:mic-check" }),
    playUri: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
    ...overrides,
  };
}

function sampleSubmission(overrides: Partial<SprechenSubmission> = {}): SprechenSubmission {
  return {
    id: "sub-1",
    user_id: "u1",
    exam_slug: "goethe-b1",
    teil: 2,
    status: "queued",
    audio_storage_path: "u1/sub-1.m4a",
    audio_duration_ms: 32_000,
    transcript_de: null,
    feedback_json: null,
    score: null,
    uploaded_at: null,
    graded_at: null,
    error_message: null,
    created_at: "2026-08-08T00:00:00.000Z",
    ...overrides,
  };
}

function makeSessionDeps(overrides: Partial<SprechenSessionDeps> = {}): {
  deps: SprechenSessionDeps;
  reserveUploadMock: ReturnType<typeof vi.fn>;
  putAudioMock: ReturnType<typeof vi.fn>;
  finalizeMock: ReturnType<typeof vi.fn>;
  getRecordingBlobMock: ReturnType<typeof vi.fn>;
  createPollerMock: ReturnType<typeof vi.fn>;
  pollerListeners: Map<string, (snap: SprechenPollingSnapshot) => void>;
  pollerStart: ReturnType<typeof vi.fn>;
  pollerStop: ReturnType<typeof vi.fn>;
} {
  const pollerListeners = new Map<string, (snap: SprechenPollingSnapshot) => void>();
  const pollerStart = vi.fn();
  const pollerStop = vi.fn();
  const reserveUploadMock = vi.fn().mockResolvedValue({
    submission_id: "sub-1",
    signed_put_url: "https://signed.example/put",
    storage_path: "u1/sub-1.m4a",
    expires_in: 900,
  });
  const putAudioMock = vi.fn().mockResolvedValue(undefined);
  const finalizeMock = vi
    .fn()
    .mockResolvedValue({ submission_id: "sub-1", status: "queued", replay: false });
  const getRecordingBlobMock = vi
    .fn()
    .mockReturnValue({ blob: new Blob(["x"]), mimeType: "audio/webm" });
  const createPollerMock = vi.fn(
    (id: string, onUpdate: (snap: SprechenPollingSnapshot) => void) => {
      pollerListeners.set(id, onUpdate);
      return { start: pollerStart, stop: pollerStop };
    }
  );

  const deps: SprechenSessionDeps = {
    reserveUpload: reserveUploadMock,
    putAudio: putAudioMock,
    finalize: finalizeMock,
    getRecordingBlob: getRecordingBlobMock,
    createPoller: createPollerMock,
    ...overrides,
  };

  return {
    deps,
    reserveUploadMock,
    putAudioMock,
    finalizeMock,
    getRecordingBlobMock,
    createPollerMock,
    pollerListeners,
    pollerStart,
    pollerStop,
  };
}

function renderScreen(
  props: {
    topicId?: string;
    sessionDeps?: SprechenSessionDeps;
    recorderFactory?: () => NativeRecorder | null;
    micCheckNativeFactory?: () => NativeMicCheck | null;
  } = {},
  { strict = false }: { strict?: boolean } = {}
) {
  const ui = (
    <SprechenSessionScreen
      topicId={props.topicId ?? "topic-1"}
      sessionDeps={props.sessionDeps}
      recorderFactory={props.recorderFactory ?? (() => makeFakeRecorder())}
      micCheckNativeFactory={props.micCheckNativeFactory ?? (() => makeFakeMicCheck())}
    />
  );
  return renderWithI18n(strict ? <StrictMode>{ui}</StrictMode> : ui);
}

async function waitForScreen(): Promise<void> {
  await waitFor(() => expect(screen.getByTestId("sprechen-session-screen")).toBeInTheDocument());
}

describe("SprechenSessionScreen (S7 Task 7.8)", () => {
  beforeEach(() => {
    installLocalStorageMock();
    __resetMicCheckFlagStoreForTests();
    window.localStorage.clear();
    pushMock.mockReset();
    replaceMock.mockReset();
    hydrateExamContextMock.mockReset();
    fetchTopicsMock.mockReset();
    trackEventMock.mockReset();
    markSubmissionInFlightMock.mockReset();
    acknowledgeReadinessMock.mockReset();
    useExamContextStore.setState({ board: "goethe", level: "b1", isLoaded: true } as never);
    useTopicHandoff.setState({ topic: null });
  });
  afterEach(() => {
    cleanup();
  });

  it("unknown topicId falls back to topics-list, then renders the error state with a back-to-catalogue CTA", async () => {
    fetchTopicsMock.mockResolvedValue([sampleTopic({ id: "some-other-topic" })]);

    renderScreen({ topicId: "missing-topic" });

    await waitFor(() =>
      expect(screen.getByTestId("sprechen-session-topic-error")).toBeInTheDocument()
    );
    expect(fetchTopicsMock).toHaveBeenCalledWith({});

    fireEvent.click(screen.getByTestId("sprechen-session-topic-error-cta"));
    expect(pushMock).toHaveBeenCalledWith("/fr/app/sprechen");
  });

  it("sprechen_session_start fires exactly once on mount with source apprendre", async () => {
    useTopicHandoff.setState({ topic: sampleTopic() });

    renderScreen({});
    await waitForScreen();

    const startCalls = trackEventMock.mock.calls.filter(
      ([name]) => name === "sprechen_session_start"
    );
    expect(startCalls).toHaveLength(1);
    expect(startCalls[0]?.[1]).toEqual({
      teil: 2,
      board: "goethe",
      level: "b1",
      source: "apprendre",
    });
  });

  it("Gliederung renders numbered steps for an outline topic", async () => {
    useTopicHandoff.setState({ topic: sampleTopic() });

    renderScreen({});
    await waitForScreen();

    expect(screen.getByTestId("sprechen-session-gliederung-step-1")).toHaveTextContent(
      "1. Einleitung"
    );
    expect(screen.getByTestId("sprechen-session-gliederung-step-2")).toHaveTextContent(
      "2. Hauptteil"
    );
    expect(screen.queryByTestId("sprechen-session-betreuer-card")).not.toBeInTheDocument();
  });

  it("falls back to the Betreuer observation card when the topic carries no outline", async () => {
    useTopicHandoff.setState({ topic: sampleTopic({ outlineSteps: [] }) });

    renderScreen({});
    await waitForScreen();

    expect(screen.getByTestId("sprechen-session-betreuer-card")).toBeInTheDocument();
    expect(screen.queryByTestId("sprechen-session-gliederung")).not.toBeInTheDocument();
  });

  it("mic-check gate blocks the start CTA until the check completes, then unblocks it", async () => {
    useTopicHandoff.setState({ topic: sampleTopic() });
    const fakeMicCheck = makeFakeMicCheck();

    renderScreen({ micCheckNativeFactory: () => fakeMicCheck });

    // Store hydrates async from (mocked, empty) localStorage —
    // passed=false once hydrated, so the gate card appears and the
    // start CTA is disabled. Real timers here — hydration is a
    // microtask, not timer-based.
    await waitFor(() =>
      expect(screen.getByTestId("sprechen-session-mic-check")).toBeInTheDocument()
    );
    expect(screen.getByTestId("sprechen-session-start-cta")).toBeDisabled();

    // Fake timers ONLY around the mic-check's internal 5s setTimeout —
    // `waitFor`'s own polling relies on real timers, so it must stay
    // outside the fake-timer window on both sides.
    vi.useFakeTimers();
    fireEvent.click(screen.getByTestId("sprechen-session-mic-check-cta"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    vi.useRealTimers();

    // `onPassed` writes the device-scoped flag synchronously (no `await`
    // in `markPassed`'s body) in the same batch as the `PLAYBACK_FINISHED`
    // dispatch, so `passed` flips to `true` — and the whole gate card
    // unmounts — in the very same render as `status: "done"`; there is no
    // separately-observable "done" frame to assert on. What's observable
    // (and what the CTA gate actually keys off): the card is gone and the
    // start CTA is enabled.
    await waitFor(() =>
      expect(screen.queryByTestId("sprechen-session-mic-check")).not.toBeInTheDocument()
    );
    expect(screen.getByTestId("sprechen-session-start-cta")).not.toBeDisabled();
    expect(window.localStorage.getItem(LEARNER_MIC_CHECK_PASSED_KEY)).toBe("true");
  });

  it("mic-check gate unblocks immediately when the learner skips the check", async () => {
    useTopicHandoff.setState({ topic: sampleTopic() });

    renderScreen({});
    await waitFor(() =>
      expect(screen.getByTestId("sprechen-session-mic-check")).toBeInTheDocument()
    );
    expect(screen.getByTestId("sprechen-session-start-cta")).toBeDisabled();

    fireEvent.click(screen.getByTestId("sprechen-session-mic-check-skip"));

    expect(screen.queryByTestId("sprechen-session-mic-check")).not.toBeInTheDocument();
    expect(screen.getByTestId("sprechen-session-start-cta")).not.toBeDisabled();
  });

  it("record view auto-stops exactly once at the level cap (#380, StrictMode-safe)", async () => {
    useTopicHandoff.setState({ topic: sampleTopic() });
    // Always reports a duration already past every possible cap (180s /
    // 240s) so the very first 100ms tick trips the auto-stop condition —
    // isolates the guard logic from simulating a full 3-4 real minutes.
    const fakeRecorder = makeFakeRecorder({
      pollStatus: vi.fn().mockReturnValue({ durationMs: 999_000, metering: -10 }),
    });

    renderScreen({ recorderFactory: () => fakeRecorder }, { strict: true });
    await waitFor(() =>
      expect(screen.getByTestId("sprechen-session-mic-check")).toBeInTheDocument()
    );
    fireEvent.click(screen.getByTestId("sprechen-session-mic-check-skip"));
    fireEvent.click(screen.getByTestId("sprechen-session-start-cta"));

    // Fake timers ONLY around the recorder's 100ms poll interval —
    // `waitFor`'s own polling relies on real timers.
    vi.useFakeTimers();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    vi.useRealTimers();

    await waitFor(() =>
      expect(screen.getByTestId("sprechen-session-review-card")).toBeInTheDocument()
    );
    expect(fakeRecorder.stopRecordingMock).toHaveBeenCalledTimes(1);
  });

  it("stop lands the review phase with the stop()-returned uri and duration, not the last polled values (#373 / F-028)", async () => {
    useTopicHandoff.setState({ topic: sampleTopic() });
    const fakeRecorder = makeFakeRecorder();
    (fakeRecorder.pollStatus as ReturnType<typeof vi.fn>).mockReturnValue({
      durationMs: 5_000,
      metering: -10,
    });
    fakeRecorder.stopRecordingMock.mockResolvedValue({
      uri: "blob:stop-return-uri",
      durationMs: 32_600,
    });

    renderScreen({ recorderFactory: () => fakeRecorder });
    await waitFor(() =>
      expect(screen.getByTestId("sprechen-session-mic-check")).toBeInTheDocument()
    );
    fireEvent.click(screen.getByTestId("sprechen-session-mic-check-skip"));
    fireEvent.click(screen.getByTestId("sprechen-session-start-cta"));

    await waitFor(() => expect(screen.getByTestId("sprechen-session-stop-cta")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("sprechen-session-stop-cta"));

    await waitFor(() =>
      expect(screen.getByTestId("sprechen-session-review-card")).toBeInTheDocument()
    );
    expect(screen.getByTestId("sprechen-session-review-player")).toHaveAttribute(
      "data-uri",
      "blob:stop-return-uri"
    );
    // 32_600ms floors to 00:32 — distinct from the 5_000ms polled value
    // (00:05) that a stale-read implementation would have shown instead.
    expect(screen.getByTestId("sprechen-session-review-duration")).toHaveTextContent("00:32");
  });

  it("a short recording shows the length-warning note + fires length_warning_shown, retake fires length_warning_retry", async () => {
    useTopicHandoff.setState({ topic: sampleTopic() });
    const fakeRecorder = makeFakeRecorder();
    fakeRecorder.stopRecordingMock.mockResolvedValue({
      uri: "blob:short-uri",
      // praesentation/B1 target = 180s; 0.5x = 90s. 40s is well under.
      durationMs: 40_000,
    });

    renderScreen({ recorderFactory: () => fakeRecorder });
    await waitFor(() =>
      expect(screen.getByTestId("sprechen-session-mic-check")).toBeInTheDocument()
    );
    fireEvent.click(screen.getByTestId("sprechen-session-mic-check-skip"));
    fireEvent.click(screen.getByTestId("sprechen-session-start-cta"));
    await waitFor(() => expect(screen.getByTestId("sprechen-session-stop-cta")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("sprechen-session-stop-cta"));

    await waitFor(() =>
      expect(screen.getByTestId("sprechen-session-review-short-note")).toBeInTheDocument()
    );
    expect(
      trackEventMock.mock.calls.some(
        ([name, props]) =>
          name === "length_warning_shown" && (props as Record<string, unknown>)?.actual_sec === 40
      )
    ).toBe(true);

    trackEventMock.mockClear();
    fireEvent.click(screen.getByTestId("sprechen-session-review-retake"));

    expect(trackEventMock.mock.calls.some(([name]) => name === "length_warning_retry")).toBe(true);
    // Back to `prep` — the mic-check gate stays skipped for the rest of
    // this screen session (mobile parity: skip is a per-visit decision,
    // not per-attempt), so the advice card reappears instead.
    await waitFor(() => expect(screen.getByTestId("sprechen-session-advice")).toBeInTheDocument());
    expect(screen.queryByTestId("sprechen-session-mic-check")).not.toBeInTheDocument();
  });

  it("submit walks prep -> awaiting; the dismiss effect fires exactly once: readiness in-flight + sprechen_session_resolve submitted-optimistic + replace to /fr/app", async () => {
    useTopicHandoff.setState({ topic: sampleTopic() });
    const fakeRecorder = makeFakeRecorder();
    const { deps, reserveUploadMock } = makeSessionDeps();

    renderScreen({ recorderFactory: () => fakeRecorder, sessionDeps: deps });
    await waitFor(() =>
      expect(screen.getByTestId("sprechen-session-mic-check")).toBeInTheDocument()
    );
    fireEvent.click(screen.getByTestId("sprechen-session-mic-check-skip"));
    fireEvent.click(screen.getByTestId("sprechen-session-start-cta"));
    await waitFor(() => expect(screen.getByTestId("sprechen-session-stop-cta")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("sprechen-session-stop-cta"));
    await waitFor(() =>
      expect(screen.getByTestId("sprechen-session-review-submit")).toBeInTheDocument()
    );

    fireEvent.click(screen.getByTestId("sprechen-session-review-submit"));

    await waitFor(() => expect(reserveUploadMock).toHaveBeenCalled());
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/fr/app"));

    expect(replaceMock).toHaveBeenCalledTimes(1);
    expect(markSubmissionInFlightMock).toHaveBeenCalledTimes(1);
    expect(markSubmissionInFlightMock).toHaveBeenCalledWith("sub-1", "sprechen");

    const resolveCalls = trackEventMock.mock.calls.filter(
      ([name]) => name === "sprechen_session_resolve"
    );
    expect(resolveCalls).toHaveLength(1);
    expect(resolveCalls[0]?.[1]).toEqual({
      teil: 2,
      source: "apprendre",
      action: "submitted-optimistic",
      had_submission: true,
    });
  });

  it("a rejected-during-submit terminal replaces to the feedback route (F-043 parity)", async () => {
    useTopicHandoff.setState({ topic: sampleTopic() });
    const fakeRecorder = makeFakeRecorder();
    const { deps, pollerListeners } = makeSessionDeps();

    renderScreen({ recorderFactory: () => fakeRecorder, sessionDeps: deps });
    await waitFor(() =>
      expect(screen.getByTestId("sprechen-session-mic-check")).toBeInTheDocument()
    );
    fireEvent.click(screen.getByTestId("sprechen-session-mic-check-skip"));
    fireEvent.click(screen.getByTestId("sprechen-session-start-cta"));
    await waitFor(() => expect(screen.getByTestId("sprechen-session-stop-cta")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("sprechen-session-stop-cta"));
    await waitFor(() =>
      expect(screen.getByTestId("sprechen-session-review-submit")).toBeInTheDocument()
    );
    fireEvent.click(screen.getByTestId("sprechen-session-review-submit"));

    await waitFor(() => expect(pollerListeners.has("sub-1")).toBe(true));
    replaceMock.mockClear();
    trackEventMock.mockClear();

    act(() => {
      pollerListeners.get("sub-1")?.({
        status: "rejected",
        data: sampleSubmission({
          id: "sub-1",
          status: "rejected",
          error_message: "language_not_german",
        }),
        error: null,
      });
    });

    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith("/fr/app/sprechen/feedback/sub-1")
    );
    expect(
      trackEventMock.mock.calls.some(
        ([name, props]) =>
          name === "sprechen_session_resolve" &&
          (props as Record<string, unknown>)?.action === "failed-optimistic"
      )
    ).toBe(true);
  });
});
