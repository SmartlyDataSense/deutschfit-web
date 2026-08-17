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
  releaseRecordingMock,
} = vi.hoisted(() => ({
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
  hydrateExamContextMock: vi.fn(),
  fetchTopicsMock: vi.fn(),
  trackEventMock: vi.fn(),
  markSubmissionInFlightMock: vi.fn(),
  acknowledgeReadinessMock: vi.fn(),
  releaseRecordingMock: vi.fn(),
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

// F2 guard: `handleReviewRetake` calls the REAL `releaseRecording` from
// `webRecorder.ts` (not a test seam) — mock just that export so the retake
// test can assert it fired with the discarded review uri.
vi.mock("@/learner/sprechen/audio/webRecorder", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/sprechen/audio/webRecorder")>();
  return { ...actual, releaseRecording: releaseRecordingMock };
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
    releaseRecordingMock.mockReset();
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

  it("auto-stop calls the native stop exactly once even when an unrelated re-render lands mid-await (#380 double-fire regression)", async () => {
    useTopicHandoff.setState({ topic: sampleTopic() });
    // `stopRecording` resolves only when the test calls `resolveStop` below —
    // this keeps `recorder.status` at "recording" (STOP_SUCCESS hasn't
    // dispatched) for as long as the test needs, isolating the exact
    // "mid-`await native.stopRecording()`" window the review flagged.
    let resolveStop: (value: { uri: string; durationMs: number }) => void = () => {};
    const stopPromise = new Promise<{ uri: string; durationMs: number }>((resolve) => {
      resolveStop = resolve;
    });
    const stopRecordingMock = vi.fn().mockReturnValue(stopPromise);
    const fakeRecorder = makeFakeRecorder({
      pollStatus: vi.fn().mockReturnValue({ durationMs: 999_000, metering: -10 }),
      stopRecording: stopRecordingMock,
    });

    renderScreen({ recorderFactory: () => fakeRecorder });
    await waitFor(() =>
      expect(screen.getByTestId("sprechen-session-mic-check")).toBeInTheDocument()
    );
    fireEvent.click(screen.getByTestId("sprechen-session-mic-check-skip"));
    fireEvent.click(screen.getByTestId("sprechen-session-start-cta"));

    // Fake timers ONLY around the recorder's 100ms poll interval — `waitFor`
    // relies on real timers throughout the rest of this test.
    vi.useFakeTimers();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    vi.useRealTimers();

    // Auto-stop has fired and `handleStop` is now suspended mid-`await
    // stop()`. Force a genuine unrelated re-render of the screen during
    // this exact window — a board change mid-recording (e.g. a late
    // exam-context hydration landing) that `sessionLevel`/`cap`/`recorder`/
    // `session.reviewRecording` don't depend on (the topic's own `cert`
    // wins over the board-derived one, and `cap` is keyed off the topic's
    // `level`, not the exam-context board/level) — a pre-fix `handleStop`
    // depending on the whole `recorder`/`session` objects would still pick
    // up a fresh identity here purely because the screen re-rendered.
    await act(async () => {
      useExamContextStore.setState({ board: "telc" } as never);
    });

    expect(stopRecordingMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveStop({ uri: "blob:recorded-uri", durationMs: 999_000 });
    });
    await waitFor(() =>
      expect(screen.getByTestId("sprechen-session-review-card")).toBeInTheDocument()
    );
    expect(stopRecordingMock).toHaveBeenCalledTimes(1);
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

  it("retake releases the discarded review uri (F2); a fresh recording's uri is left retained", async () => {
    useTopicHandoff.setState({ topic: sampleTopic() });
    const fakeRecorder = makeFakeRecorder();
    fakeRecorder.stopRecordingMock.mockResolvedValueOnce({
      uri: "blob:retake-old-uri",
      durationMs: 32_000,
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
      expect(screen.getByTestId("sprechen-session-review-retake")).toBeInTheDocument()
    );

    expect(releaseRecordingMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("sprechen-session-review-retake"));

    expect(releaseRecordingMock).toHaveBeenCalledWith("blob:retake-old-uri");
    expect(releaseRecordingMock).toHaveBeenCalledTimes(1);

    // A second, fresh recording round: back at `prep` (advice card — the
    // mic-check skip persists), record again, stop with a NEW uri. That
    // uri must NOT be released here — it's the one about to be reviewed /
    // submitted, not discarded.
    await waitFor(() => expect(screen.getByTestId("sprechen-session-advice")).toBeInTheDocument());
    releaseRecordingMock.mockClear();
    fakeRecorder.stopRecordingMock.mockResolvedValueOnce({
      uri: "blob:retake-new-uri",
      durationMs: 30_000,
    });
    fireEvent.click(screen.getByTestId("sprechen-session-start-cta"));
    await waitFor(() => expect(screen.getByTestId("sprechen-session-stop-cta")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("sprechen-session-stop-cta"));
    await waitFor(() =>
      expect(screen.getByTestId("sprechen-session-review-retake")).toBeInTheDocument()
    );

    expect(releaseRecordingMock).not.toHaveBeenCalled();
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

  // #54 — a pure send failure (reserve/PUT/finalize threw before any
  // submission ever existed server-side) offers an explicit retry that
  // re-runs the WHOLE upload sequence from the retained recording, rather
  // than resurrecting the abandoned `submissionId` (which the hook already
  // reset to `null`). Also the concrete evidence that the F2 blob-registry
  // contract actually holds at retry time: `getRecordingBlobMock` resolves
  // the SAME uri a second time, proving the registry never dropped it.
  it("#54: a pure send failure offers a retry that re-runs reserve -> PUT -> finalize from the retained recording", async () => {
    useTopicHandoff.setState({ topic: sampleTopic() });
    const fakeRecorder = makeFakeRecorder();
    const { deps, reserveUploadMock, putAudioMock, finalizeMock, getRecordingBlobMock } =
      makeSessionDeps();
    // Fail post-`getRecordingBlobFn` (at the PUT step) — this is the shape
    // that actually exercises the F2 blob-retrieval contract on retry (a
    // pre-`getRecordingBlobFn` failure, e.g. `reserveUpload` itself
    // rejecting, would never call it on the first attempt at all).
    putAudioMock.mockRejectedValueOnce(new Error("upload_failed"));

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

    await waitFor(() =>
      expect(screen.getByTestId("sprechen-session-send-failed")).toBeInTheDocument()
    );
    expect(screen.getByTestId("sprechen-session-error-code")).toHaveTextContent("upload_failed");
    expect(reserveUploadMock).toHaveBeenCalledTimes(1);

    replaceMock.mockClear();
    fireEvent.click(screen.getByTestId("sprechen-session-send-failed-cta"));

    // A SECOND, fresh reserve — not a re-PUT against the dead reservation.
    await waitFor(() => expect(reserveUploadMock).toHaveBeenCalledTimes(2));
    // The retained blob is still resolvable via the registry seam at retry
    // time — same uri both times, proving nothing released it between the
    // failed first attempt and the retry.
    expect(getRecordingBlobMock).toHaveBeenCalledTimes(2);
    expect(getRecordingBlobMock).toHaveBeenNthCalledWith(1, "blob:recorded-uri");
    expect(getRecordingBlobMock).toHaveBeenNthCalledWith(2, "blob:recorded-uri");
    // put was attempted both times (fails first, succeeds on retry);
    // finalize only ever runs after a successful put, so once.
    expect(putAudioMock).toHaveBeenCalledTimes(2);
    expect(finalizeMock).toHaveBeenCalledTimes(1);

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/fr/app"));
  });

  // Negative case — a fallback where a submission DOES already exist
  // server-side (a post-upload grading failure/timeout, not a send
  // failure) must NOT offer the #54 retry: `submissionId` stays non-null in
  // that branch of the hook, so retrying would abandon a live submission
  // instead of resuming a dead one.
  it("#54: a post-upload grading timeout (submissionId retained) does NOT offer the send-failed retry", async () => {
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

    act(() => {
      pollerListeners.get("sub-1")?.({ status: "timeout", data: null, error: null });
    });

    await waitFor(() =>
      expect(screen.getByTestId("sprechen-session-empty-state")).toBeInTheDocument()
    );
    expect(screen.queryByTestId("sprechen-session-send-failed")).not.toBeInTheDocument();
  });

  // S7-7.8 regression pin — a `graded` poller snapshot with unified
  // (schema_version >= 2) data must drive `FeedbackView`'s inline
  // `ModuleResultLayout` with the RIGHT props wired to the RIGHT slots. A
  // prop swap (e.g. `coach_feedback_fr` passed as `nextDrillFr`, or
  // `focus_areas` dropped) would ship silently — nothing asserted the
  // rendered content of this screen's done-phase view before.
  it("a graded v2 snapshot renders the inline ModuleResultLayout wired to the unified fields", async () => {
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

    const gradedSubmission = sampleSubmission({
      id: "sub-1",
      status: "graded",
      schema_version: 2,
      transcript_de: "Ich möchte über meine Wohnung sprechen.",
      normalized_total_pct: 73,
      dimension_scores_json: {
        aussprache: { score: 4, max: 5, pct: 80 },
        wortschatz: { score: 3, max: 5, pct: 60 },
      },
      feedback_json: {
        coach_feedback_fr: "Bonne prononciation, continue ainsi.",
        next_drill_fr: "Travaille le vocabulaire du logement.",
        focus_areas: ["wortschatz", "aussprache"],
        model_answer_de: "Meine Wohnung liegt im Zentrum der Stadt.",
      },
    });

    act(() => {
      pollerListeners.get("sub-1")?.({
        status: "graded",
        data: gradedSubmission,
        error: null,
      });
    });

    await waitFor(() =>
      expect(screen.getByTestId("sprechen-session-module-result")).toBeInTheDocument()
    );

    // Donut: normalized_total_pct=73 -> pct text "73%".
    expect(screen.getByTestId("sprechen-session-module-result-donut")).toHaveTextContent("73%");

    // Betreuer card carries coach_feedback_fr + next_drill_fr in the RIGHT
    // slots (not swapped) — BetreuerCard renders both as plain <p> text
    // with no distinguishing testid, so a prop swap wouldn't be caught by
    // toHaveTextContent alone (both strings would still be present
    // somewhere in the card); assert DOM order instead, which mirrors the
    // component's fixed [title, coachFeedbackFr, nextDrillFr] paragraph
    // sequence.
    const betreuerCard = screen.getByTestId("sprechen-session-module-result-betreuer-card");
    const betreuerParagraphs = betreuerCard.querySelectorAll("p");
    expect(betreuerParagraphs[1]).toHaveTextContent("Bonne prononciation, continue ainsi.");
    expect(betreuerParagraphs[2]).toHaveTextContent("Travaille le vocabulaire du logement.");

    // Focus chips render both areas.
    const focusChips = screen.getByTestId("sprechen-session-module-result-focus-chips");
    expect(focusChips).toHaveTextContent("wortschatz");
    expect(focusChips).toHaveTextContent("aussprache");

    // Personalized model card carries model_answer_de.
    expect(
      screen.getByTestId("sprechen-session-module-result-personalized-model")
    ).toHaveTextContent("Meine Wohnung liegt im Zentrum der Stadt.");

    // Transcript card carries transcript_de.
    expect(screen.getByTestId("sprechen-session-module-result-transcript")).toHaveTextContent(
      "Ich möchte über meine Wohnung sprechen."
    );

    // Both dimension rows rendered, each keyed under its own key.
    expect(
      screen.getByTestId("sprechen-session-module-result-competence-aussprache")
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("sprechen-session-module-result-competence-wortschatz")
    ).toBeInTheDocument();
  });
});
