/**
 * `useSprechenSession` — S7 · Task 7.4.
 *
 * Port of `deutschfit-mobile/src/features/sprechen/hooks/useSprechenSession.ts`'s
 * test surface with the mock-leg / fixture branches stripped (P1, anti-
 * requirement 2 — no `evaluatePrompt` fixture, no `source`/`onResolve`).
 *
 * Deps are scripted directly through the hook's `deps` argument (mobile
 * parity — `SprechenSessionDeps`), never via `vi.mock` of the facade; only
 * `trackEvent` is partial-mocked (same `importOriginal` passthrough idiom
 * as `learner-writing-polling.test.ts`) so the no-recording branch's
 * analytics call can be asserted.
 *
 * No fake timers here — `useSprechenSession` itself is Promise-based, not
 * timer-based; the 5s/240s polling cadence lives entirely behind the
 * injected `createPoller` fake, which never touches a real timer in these
 * tests.
 */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { trackEventMock, releaseRecordingMock } = vi.hoisted(() => ({
  trackEventMock: vi.fn(),
  releaseRecordingMock: vi.fn(),
}));

vi.mock("@/learner/core/analytics/posthog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/core/analytics/posthog")>();
  return { ...actual, trackEvent: trackEventMock };
});

// F2 guard: the hook's post-finalize release calls the REAL
// `releaseRecording` from `webRecorder.ts` (not part of `SprechenSessionDeps`)
// — mock just that export so finalize-success/-failure tests can assert it.
vi.mock("@/learner/sprechen/audio/webRecorder", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/sprechen/audio/webRecorder")>();
  return { ...actual, releaseRecording: releaseRecordingMock };
});

import type { ReserveUploadResult, SprechenSubmission } from "@/learner/core/api/examApi";
import { useSprechenSession } from "@/learner/sprechen/hooks/useSprechenSession";
import type { SprechenPollingSnapshot } from "@/learner/sprechen/hooks/useSprechenSubmissionPolling";

function sampleSubmission(overrides: Partial<SprechenSubmission> = {}): SprechenSubmission {
  return {
    id: "sub-6",
    user_id: "u1",
    exam_slug: "goethe-b1",
    teil: 1,
    status: "graded",
    audio_storage_path: "u1/sub-6.m4a",
    audio_duration_ms: 20_000,
    transcript_de: "Ich habe ein Referat vorbereitet.",
    feedback_json: null,
    score: 88,
    uploaded_at: "2026-08-08T00:00:00.000Z",
    graded_at: "2026-08-08T00:03:00.000Z",
    error_message: null,
    created_at: "2026-08-08T00:00:00.000Z",
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  trackEventMock.mockReset();
  releaseRecordingMock.mockReset();
});

describe("useSprechenSession", () => {
  it("happy path walks prep -> record -> review -> submit -> awaiting, calling reserve/put/finalize in order with put receiving the registry blob's own type", async () => {
    const reserveUploadMock = vi.fn().mockResolvedValue({
      submission_id: "sub-1",
      signed_put_url: "https://signed.example/put",
      storage_path: "u1/sub-1.m4a",
      expires_in: 900,
    } satisfies ReserveUploadResult);
    const blob = new Blob(["audio-bytes"], { type: "audio/webm;codecs=opus" });
    const getRecordingBlobMock = vi
      .fn()
      .mockReturnValue({ blob, mimeType: "audio/webm;codecs=opus" });
    const putAudioMock = vi.fn().mockResolvedValue(undefined);
    const finalizeMock = vi
      .fn()
      .mockResolvedValue({ submission_id: "sub-1", status: "queued", replay: false });
    const pollerStart = vi.fn();
    const pollerStop = vi.fn();
    const createPollerMock = vi.fn().mockReturnValue({ start: pollerStart, stop: pollerStop });

    const { result } = renderHook(() =>
      useSprechenSession({
        examSlug: "goethe-b1",
        teil: 2,
        topicId: "topic-1",
        subgenre: "praesentation",
        cert: "GOETHE",
        level: "B1",
        deps: {
          reserveUpload: reserveUploadMock,
          putAudio: putAudioMock,
          finalize: finalizeMock,
          getRecordingBlob: getRecordingBlobMock,
          createPoller: createPollerMock,
        },
      })
    );

    expect(result.current.phase).toBe("prep");

    act(() => result.current.startRecording());
    expect(result.current.phase).toBe("record");

    act(() => result.current.reviewRecording({ recordingUri: "blob:uri-1", durationMs: 32_000 }));
    expect(result.current.phase).toBe("review");
    expect(result.current.recordingUri).toBe("blob:uri-1");
    expect(result.current.durationMs).toBe(32_000);

    act(() => result.current.submitRecording({ recordingUri: "blob:uri-1", durationMs: 32_000 }));
    expect(result.current.phase).toBe("submit");

    await waitFor(() => expect(result.current.phase).toBe("awaiting"));
    expect(result.current.submissionId).toBe("sub-1");

    expect(reserveUploadMock).toHaveBeenCalledWith({
      examSlug: "goethe-b1",
      teil: 2,
      clientSubmissionId: expect.stringMatching(/^topic-1-\d+$/) as unknown as string,
      cert: "GOETHE",
      level: "B1",
    });
    expect(getRecordingBlobMock).toHaveBeenCalledWith("blob:uri-1");
    expect(putAudioMock).toHaveBeenCalledWith(
      "https://signed.example/put",
      blob,
      "audio/webm;codecs=opus"
    );
    expect(finalizeMock).toHaveBeenCalledWith({
      submissionId: "sub-1",
      subgenre: "praesentation",
      level: "B1",
      topicId: "topic-1",
      durationSec: 32,
    });

    // Call order: reserve -> put -> finalize.
    const reserveOrder = reserveUploadMock.mock.invocationCallOrder[0] ?? -1;
    const putOrder = putAudioMock.mock.invocationCallOrder[0] ?? -1;
    const finalizeOrder = finalizeMock.mock.invocationCallOrder[0] ?? -1;
    expect(reserveOrder).toBeLessThan(putOrder);
    expect(putOrder).toBeLessThan(finalizeOrder);

    expect(createPollerMock).toHaveBeenCalledWith(
      "sub-1",
      expect.any(Function) as unknown as () => void
    );
    expect(pollerStart).toHaveBeenCalledTimes(1);
  });

  it("F2: finalize success releases the submitted uri once reserve/put/finalize all resolved", async () => {
    const reserveUploadMock = vi.fn().mockResolvedValue({
      submission_id: "sub-1",
      signed_put_url: "https://signed.example/put",
      storage_path: "u1/sub-1.m4a",
      expires_in: 900,
    } satisfies ReserveUploadResult);
    const blob = new Blob(["audio-bytes"], { type: "audio/webm;codecs=opus" });
    const getRecordingBlobMock = vi
      .fn()
      .mockReturnValue({ blob, mimeType: "audio/webm;codecs=opus" });
    const putAudioMock = vi.fn().mockResolvedValue(undefined);
    const finalizeMock = vi
      .fn()
      .mockResolvedValue({ submission_id: "sub-1", status: "queued", replay: false });
    const createPollerMock = vi.fn().mockReturnValue({ start: vi.fn(), stop: vi.fn() });

    const { result } = renderHook(() =>
      useSprechenSession({
        examSlug: "goethe-b1",
        teil: 2,
        topicId: "topic-1",
        subgenre: "praesentation",
        level: "B1",
        deps: {
          reserveUpload: reserveUploadMock,
          putAudio: putAudioMock,
          finalize: finalizeMock,
          getRecordingBlob: getRecordingBlobMock,
          createPoller: createPollerMock,
        },
      })
    );

    act(() => result.current.reviewRecording({ recordingUri: "blob:uri-1", durationMs: 32_000 }));
    act(() => result.current.submitRecording({ recordingUri: "blob:uri-1", durationMs: 32_000 }));

    await waitFor(() => expect(result.current.phase).toBe("awaiting"));
    // The blob was still needed while `putFn` ran — release must not have
    // fired before finalize actually resolved.
    expect(releaseRecordingMock).toHaveBeenCalledWith("blob:uri-1");
    expect(releaseRecordingMock).toHaveBeenCalledTimes(1);
  });

  it("finalize rejection lands the fallback phase with the server code surfaced", async () => {
    const reserveUploadMock = vi.fn().mockResolvedValue({
      submission_id: "sub-2",
      signed_put_url: "https://signed.example/put",
      storage_path: "u1/sub-2.m4a",
      expires_in: 900,
    } satisfies ReserveUploadResult);
    const blob = new Blob(["x"], { type: "audio/mp4" });
    const getRecordingBlobMock = vi.fn().mockReturnValue({ blob, mimeType: "audio/mp4" });
    const putAudioMock = vi.fn().mockResolvedValue(undefined);
    const finalizeMock = vi.fn().mockRejectedValue(new Error("bad_source_status"));
    const createPollerMock = vi.fn();

    const { result } = renderHook(() =>
      useSprechenSession({
        examSlug: "goethe-b1",
        teil: 1,
        topicId: "topic-2",
        subgenre: "vortrag",
        level: "B2",
        deps: {
          reserveUpload: reserveUploadMock,
          putAudio: putAudioMock,
          finalize: finalizeMock,
          getRecordingBlob: getRecordingBlobMock,
          createPoller: createPollerMock,
        },
      })
    );

    act(() => result.current.reviewRecording({ recordingUri: "blob:uri-2", durationMs: 10_000 }));
    act(() => result.current.submitRecording({ recordingUri: "blob:uri-2", durationMs: 10_000 }));

    await waitFor(() => expect(result.current.phase).toBe("fallback"));
    expect(result.current.error).toBe("bad_source_status");
    // The upload never completed — no poller was ever created.
    expect(createPollerMock).not.toHaveBeenCalled();
    // F2: finalize failed — the blob must be RETAINED (never released) so
    // a caller-driven retry can still resolve it via getRecordingBlobFn.
    expect(releaseRecordingMock).not.toHaveBeenCalled();
  });

  it("re-entrant submitRecording while in-flight is a no-op (re-entrancy ref)", async () => {
    let resolveReserve: ((v: ReserveUploadResult) => void) | undefined;
    const reserveUploadMock = vi.fn().mockImplementation(
      () =>
        new Promise<ReserveUploadResult>((resolve) => {
          resolveReserve = resolve;
        })
    );
    const blob = new Blob(["x"], { type: "audio/webm" });
    const getRecordingBlobMock = vi.fn().mockReturnValue({ blob, mimeType: "audio/webm" });
    const putAudioMock = vi.fn().mockResolvedValue(undefined);
    const finalizeMock = vi
      .fn()
      .mockResolvedValue({ submission_id: "sub-3", status: "queued", replay: false });
    const createPollerMock = vi.fn().mockReturnValue({ start: vi.fn(), stop: vi.fn() });

    const { result } = renderHook(() =>
      useSprechenSession({
        examSlug: "goethe-b1",
        teil: 1,
        topicId: "topic-3",
        subgenre: "praesentation",
        level: "B1",
        deps: {
          reserveUpload: reserveUploadMock,
          putAudio: putAudioMock,
          finalize: finalizeMock,
          getRecordingBlob: getRecordingBlobMock,
          createPoller: createPollerMock,
        },
      })
    );

    act(() => result.current.reviewRecording({ recordingUri: "blob:uri-3", durationMs: 8_000 }));
    act(() => result.current.submitRecording({ recordingUri: "blob:uri-3", durationMs: 8_000 }));
    // Second call while the first is still awaiting `reserveUpload` — a no-op.
    act(() => result.current.submitRecording({ recordingUri: "blob:uri-3", durationMs: 8_000 }));

    expect(reserveUploadMock).toHaveBeenCalledTimes(1);

    resolveReserve?.({
      submission_id: "sub-3",
      signed_put_url: "https://signed.example/put",
      storage_path: "u1/sub-3.m4a",
      expires_in: 900,
    });
    await waitFor(() => expect(result.current.phase).toBe("awaiting"));

    // The ref cleared once the first attempt settled — a fresh submit now
    // goes through (not asserted further here; the guard is per-call, not
    // per-session).
    expect(putAudioMock).toHaveBeenCalledTimes(1);
    expect(finalizeMock).toHaveBeenCalledTimes(1);
  });

  it("no-recording submit lands 'fallback' and emits sprechen_submit_no_recording", () => {
    const reserveUploadMock = vi.fn();
    const { result } = renderHook(() =>
      useSprechenSession({
        examSlug: "goethe-b1",
        teil: 3,
        topicId: "topic-4",
        subgenre: "vortrag",
        level: "B2",
        deps: { reserveUpload: reserveUploadMock },
      })
    );

    act(() => result.current.submitRecording({ recordingUri: null, durationMs: 1_500 }));

    expect(result.current.phase).toBe("fallback");
    expect(result.current.error).toBe("no_recording");
    expect(reserveUploadMock).not.toHaveBeenCalled();
    expect(trackEventMock).toHaveBeenCalledWith("sprechen_submit_no_recording", {
      prompt_id: "topic-4",
      teil: 3,
      duration_ms: 1_500,
    });
  });

  it("no-recording review also lands 'fallback' and emits the same event", () => {
    const { result } = renderHook(() =>
      useSprechenSession({
        examSlug: "goethe-b1",
        teil: 1,
        topicId: "topic-5",
        subgenre: "praesentation",
        level: "B1",
      })
    );

    act(() => result.current.reviewRecording({ recordingUri: null, durationMs: 500 }));

    expect(result.current.phase).toBe("fallback");
    expect(result.current.error).toBe("no_recording");
    expect(trackEventMock).toHaveBeenCalledWith("sprechen_submit_no_recording", {
      prompt_id: "topic-5",
      teil: 1,
      duration_ms: 500,
    });
  });

  it("a 'graded' poll snapshot lands phase 'done' with the submission row attached", async () => {
    const reserveUploadMock = vi.fn().mockResolvedValue({
      submission_id: "sub-6",
      signed_put_url: "https://signed.example/put",
      storage_path: "u1/sub-6.m4a",
      expires_in: 900,
    } satisfies ReserveUploadResult);
    const blob = new Blob(["x"], { type: "audio/webm" });
    const getRecordingBlobMock = vi.fn().mockReturnValue({ blob, mimeType: "audio/webm" });
    const putAudioMock = vi.fn().mockResolvedValue(undefined);
    const finalizeMock = vi
      .fn()
      .mockResolvedValue({ submission_id: "sub-6", status: "queued", replay: false });
    let capturedOnUpdate: ((snap: SprechenPollingSnapshot) => void) | undefined;
    const createPollerMock = vi
      .fn()
      .mockImplementation((_id: string, onUpdate: (snap: SprechenPollingSnapshot) => void) => {
        capturedOnUpdate = onUpdate;
        return { start: vi.fn(), stop: vi.fn() };
      });

    const { result } = renderHook(() =>
      useSprechenSession({
        examSlug: "goethe-b1",
        teil: 1,
        topicId: "topic-6",
        subgenre: "praesentation",
        level: "B1",
        deps: {
          reserveUpload: reserveUploadMock,
          putAudio: putAudioMock,
          finalize: finalizeMock,
          getRecordingBlob: getRecordingBlobMock,
          createPoller: createPollerMock,
        },
      })
    );

    act(() => result.current.reviewRecording({ recordingUri: "blob:uri-6", durationMs: 20_000 }));
    act(() => result.current.submitRecording({ recordingUri: "blob:uri-6", durationMs: 20_000 }));
    await waitFor(() => expect(result.current.phase).toBe("awaiting"));

    const gradedRow = sampleSubmission();
    act(() => {
      capturedOnUpdate?.({ status: "graded", data: gradedRow, error: null });
    });

    expect(result.current.phase).toBe("done");
    expect(result.current.submission).toEqual(gradedRow);
  });

  it("a 'timeout' poll snapshot lands 'fallback' with error 'grading_timeout'", async () => {
    const reserveUploadMock = vi.fn().mockResolvedValue({
      submission_id: "sub-7",
      signed_put_url: "https://signed.example/put",
      storage_path: "u1/sub-7.m4a",
      expires_in: 900,
    } satisfies ReserveUploadResult);
    const blob = new Blob(["x"], { type: "audio/webm" });
    const getRecordingBlobMock = vi.fn().mockReturnValue({ blob, mimeType: "audio/webm" });
    const putAudioMock = vi.fn().mockResolvedValue(undefined);
    const finalizeMock = vi
      .fn()
      .mockResolvedValue({ submission_id: "sub-7", status: "queued", replay: false });
    let capturedOnUpdate: ((snap: SprechenPollingSnapshot) => void) | undefined;
    const createPollerMock = vi
      .fn()
      .mockImplementation((_id: string, onUpdate: (snap: SprechenPollingSnapshot) => void) => {
        capturedOnUpdate = onUpdate;
        return { start: vi.fn(), stop: vi.fn() };
      });

    const { result } = renderHook(() =>
      useSprechenSession({
        examSlug: "goethe-b1",
        teil: 1,
        topicId: "topic-7",
        subgenre: "praesentation",
        level: "B1",
        deps: {
          reserveUpload: reserveUploadMock,
          putAudio: putAudioMock,
          finalize: finalizeMock,
          getRecordingBlob: getRecordingBlobMock,
          createPoller: createPollerMock,
        },
      })
    );

    act(() => result.current.reviewRecording({ recordingUri: "blob:uri-7", durationMs: 20_000 }));
    act(() => result.current.submitRecording({ recordingUri: "blob:uri-7", durationMs: 20_000 }));
    await waitFor(() => expect(result.current.phase).toBe("awaiting"));

    act(() => {
      capturedOnUpdate?.({ status: "timeout", data: null, error: null });
    });

    expect(result.current.phase).toBe("fallback");
    expect(result.current.error).toBe("grading_timeout");
  });

  it("reset() stops the poller and returns to prep", async () => {
    const reserveUploadMock = vi.fn().mockResolvedValue({
      submission_id: "sub-8",
      signed_put_url: "https://signed.example/put",
      storage_path: "u1/sub-8.m4a",
      expires_in: 900,
    } satisfies ReserveUploadResult);
    const blob = new Blob(["x"], { type: "audio/webm" });
    const getRecordingBlobMock = vi.fn().mockReturnValue({ blob, mimeType: "audio/webm" });
    const putAudioMock = vi.fn().mockResolvedValue(undefined);
    const finalizeMock = vi
      .fn()
      .mockResolvedValue({ submission_id: "sub-8", status: "queued", replay: false });
    const pollerStop = vi.fn();
    const createPollerMock = vi.fn().mockReturnValue({ start: vi.fn(), stop: pollerStop });

    const { result } = renderHook(() =>
      useSprechenSession({
        examSlug: "goethe-b1",
        teil: 1,
        topicId: "topic-8",
        subgenre: "praesentation",
        level: "B1",
        deps: {
          reserveUpload: reserveUploadMock,
          putAudio: putAudioMock,
          finalize: finalizeMock,
          getRecordingBlob: getRecordingBlobMock,
          createPoller: createPollerMock,
        },
      })
    );

    act(() => result.current.reviewRecording({ recordingUri: "blob:uri-8", durationMs: 20_000 }));
    act(() => result.current.submitRecording({ recordingUri: "blob:uri-8", durationMs: 20_000 }));
    await waitFor(() => expect(result.current.phase).toBe("awaiting"));

    act(() => result.current.reset());

    expect(pollerStop).toHaveBeenCalledTimes(1);
    expect(result.current.phase).toBe("prep");
    expect(result.current.submissionId).toBeNull();
    expect(result.current.recordingUri).toBeNull();
    expect(result.current.durationMs).toBe(0);
  });
});
