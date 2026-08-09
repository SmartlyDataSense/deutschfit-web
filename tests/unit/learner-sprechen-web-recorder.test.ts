import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createWebRecorder,
  getRecordingBlob,
  pickRecorderMimeType,
  releaseRecording,
} from "@/learner/sprechen/audio/webRecorder";

// ---------------------------------------------------------------------------
// jsdom stubs. jsdom implements neither MediaRecorder, getUserMedia,
// AudioContext, nor the URL object-URL pair — every one is faked here per
// the plan's "jsdom stubs" note. Installed/removed per-test via
// beforeEach/afterEach so the "MediaRecorder undefined" tests can delete
// the global cleanly.
// ---------------------------------------------------------------------------

type Listener = (event: unknown) => void;

class FakeMediaRecorder {
  static isTypeSupportedImpl: (type: string) => boolean = (type) =>
    type === "audio/webm;codecs=opus";
  static isTypeSupported(type: string): boolean {
    return FakeMediaRecorder.isTypeSupportedImpl(type);
  }
  static instances: FakeMediaRecorder[] = [];

  state: "inactive" | "recording" | "paused" = "inactive";
  stream: MediaStream;
  mimeType: string;
  private listeners = new Map<string, Set<Listener>>();

  constructor(stream: MediaStream, options?: { mimeType?: string }) {
    this.stream = stream;
    this.mimeType = options?.mimeType ?? "";
    FakeMediaRecorder.instances.push(this);
  }

  addEventListener(type: string, cb: Listener): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(cb);
  }
  removeEventListener(type: string, cb: Listener): void {
    this.listeners.get(type)?.delete(cb);
  }
  private dispatch(type: string, event: unknown): void {
    this.listeners.get(type)?.forEach((cb) => cb(event));
  }

  start(): void {
    this.state = "recording";
  }

  stop(): void {
    this.state = "inactive";
    // Real MediaRecorder fires `dataavailable` (with the captured chunk)
    // before `stop` — the adapter's Blob assembly depends on that order.
    this.dispatch("dataavailable", { data: new Blob(["fake-chunk"], { type: this.mimeType }) });
    this.dispatch("stop", {});
  }
}

function makeFakeTrack() {
  return { stop: vi.fn() };
}

function makeFakeStream(trackCount = 1): MediaStream {
  const tracks = Array.from({ length: trackCount }, () => makeFakeTrack());
  return { getTracks: () => tracks } as unknown as MediaStream;
}

/** Amplitude the fake analyser fills every sample with; 0 = silence (the
 * default), 1 = full-scale loud signal. Reset in `beforeEach`. */
let fakeAnalyserAmplitude = 0;

class FakeAnalyserNode {
  fftSize = 2048;
  getFloatTimeDomainData = vi.fn((buffer: Float32Array) => {
    buffer.fill(fakeAnalyserAmplitude);
  });
}

class FakeAudioContext {
  state: "running" | "closed" = "running";
  createMediaStreamSource = vi.fn(() => ({ connect: vi.fn() }));
  createAnalyser = vi.fn(() => new FakeAnalyserNode());
  close = vi.fn(async () => {
    this.state = "closed";
  });
}

let getUserMediaMock: ReturnType<typeof vi.fn>;
let createObjectURLMock: ReturnType<typeof vi.fn>;
let revokeObjectURLMock: ReturnType<typeof vi.fn>;
let objectUrlCounter = 0;

beforeEach(() => {
  FakeMediaRecorder.instances = [];
  FakeMediaRecorder.isTypeSupportedImpl = (type) => type === "audio/webm;codecs=opus";
  objectUrlCounter = 0;
  fakeAnalyserAmplitude = 0;

  vi.stubGlobal("MediaRecorder", FakeMediaRecorder as unknown as typeof MediaRecorder);
  vi.stubGlobal("AudioContext", FakeAudioContext as unknown as typeof AudioContext);

  getUserMediaMock = vi.fn(async () => makeFakeStream());
  Object.defineProperty(window.navigator, "mediaDevices", {
    value: { getUserMedia: getUserMediaMock },
    configurable: true,
  });

  createObjectURLMock = vi.fn(() => `blob:fake-${++objectUrlCounter}`);
  revokeObjectURLMock = vi.fn();
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: createObjectURLMock,
    revokeObjectURL: revokeObjectURLMock,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// pickRecorderMimeType — negotiation order.
// ---------------------------------------------------------------------------
describe("pickRecorderMimeType", () => {
  it("picks the first supported candidate in priority order: webm/opus", () => {
    FakeMediaRecorder.isTypeSupportedImpl = (type) => type === "audio/webm;codecs=opus";
    expect(pickRecorderMimeType()).toBe("audio/webm;codecs=opus");
  });

  it("falls back to webm when webm/opus is unsupported", () => {
    FakeMediaRecorder.isTypeSupportedImpl = (type) => type === "audio/webm";
    expect(pickRecorderMimeType()).toBe("audio/webm");
  });

  it("falls back to mp4 (Safari) when webm is entirely unsupported", () => {
    FakeMediaRecorder.isTypeSupportedImpl = (type) => type === "audio/mp4";
    expect(pickRecorderMimeType()).toBe("audio/mp4");
  });

  it("returns null when nothing is supported", () => {
    FakeMediaRecorder.isTypeSupportedImpl = () => false;
    expect(pickRecorderMimeType()).toBeNull();
  });

  it("returns null when MediaRecorder is undefined entirely", () => {
    vi.stubGlobal("MediaRecorder", undefined);
    expect(pickRecorderMimeType()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// requestPermissions — NotAllowedError -> denied; other errors propagate.
// ---------------------------------------------------------------------------
describe("createWebRecorder().requestPermissions", () => {
  it("resolves granted:true and releases the probe stream's tracks", async () => {
    const track = makeFakeTrack();
    getUserMediaMock.mockResolvedValueOnce({ getTracks: () => [track] } as unknown as MediaStream);
    const recorder = createWebRecorder();
    const result = await recorder.requestPermissions();
    expect(result).toEqual({ granted: true });
    expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it("NotAllowedError -> {granted: false}, does not throw", async () => {
    const err = new Error("denied");
    err.name = "NotAllowedError";
    getUserMediaMock.mockRejectedValueOnce(err);
    const recorder = createWebRecorder();
    await expect(recorder.requestPermissions()).resolves.toEqual({ granted: false });
  });

  it("other getUserMedia errors propagate (not swallowed as denied)", async () => {
    const err = new Error("no device");
    err.name = "NotFoundError";
    getUserMediaMock.mockRejectedValueOnce(err);
    const recorder = createWebRecorder();
    await expect(recorder.requestPermissions()).rejects.toThrow("no device");
  });
});

// ---------------------------------------------------------------------------
// startRecording / stopRecording — capture + registry + mimeType fidelity.
// ---------------------------------------------------------------------------
describe("createWebRecorder() capture lifecycle", () => {
  it("startRecording negotiates the mimeType and constructs MediaRecorder with it", async () => {
    FakeMediaRecorder.isTypeSupportedImpl = (type) => type === "audio/webm";
    const recorder = createWebRecorder();
    await recorder.startRecording();
    expect(FakeMediaRecorder.instances).toHaveLength(1);
    expect(FakeMediaRecorder.instances[0]?.mimeType).toBe("audio/webm");
    expect(FakeMediaRecorder.instances[0]?.state).toBe("recording");
  });

  it("stopRecording assembles a Blob of the negotiated mime type and registers it", async () => {
    const recorder = createWebRecorder();
    await recorder.startRecording();
    const { uri, durationMs } = await recorder.stopRecording();

    expect(uri).toBe("blob:fake-1");
    expect(durationMs).toBeGreaterThanOrEqual(0);
    expect(createObjectURLMock).toHaveBeenCalledTimes(1);

    const entry = getRecordingBlob(uri);
    expect(entry).not.toBeNull();
    expect(entry?.mimeType).toBe("audio/webm;codecs=opus");
    expect(entry?.blob).toBeInstanceOf(Blob);
    expect(entry?.blob.type).toBe("audio/webm;codecs=opus");
    // Data-fidelity: FakeMediaRecorder.stop() fires one `dataavailable`
    // carrying a 10-byte "fake-chunk" BlobPart before `stop` — the
    // assembled Blob must actually contain it (catches a dropped
    // `chunks.push(event.data)` in the adapter's dataavailable handler,
    // which every other assertion here would miss since size 0 still
    // satisfies "is a Blob of the right mime type").
    expect(entry?.blob.size).toBe(10);
  });

  it("stopRecording stops the underlying MediaRecorder and releases the stream's tracks", async () => {
    const track = makeFakeTrack();
    getUserMediaMock.mockResolvedValueOnce({ getTracks: () => [track] } as unknown as MediaStream);
    const recorder = createWebRecorder();
    await recorder.startRecording();
    await recorder.stopRecording();
    expect(FakeMediaRecorder.instances[0]?.state).toBe("inactive");
    expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it("each stopRecording() mints a unique object URL", async () => {
    const recorder1 = createWebRecorder();
    await recorder1.startRecording();
    const first = await recorder1.stopRecording();

    const recorder2 = createWebRecorder();
    await recorder2.startRecording();
    const second = await recorder2.stopRecording();

    expect(first.uri).not.toBe(second.uri);
    expect(getRecordingBlob(first.uri)).not.toBeNull();
    expect(getRecordingBlob(second.uri)).not.toBeNull();
  });

  it("pollStatus returns null before startRecording, and {durationMs, metering} once recording", async () => {
    const recorder = createWebRecorder();
    expect(recorder.pollStatus()).toBeNull();
    await recorder.startRecording();
    const status = recorder.pollStatus();
    expect(status).not.toBeNull();
    expect(typeof status?.durationMs).toBe("number");
    // Silence (RMS 0 from the fake analyser's zero-filled buffer) -> floor.
    expect(status?.metering).toBe(-60);
  });

  it("pollStatus clamps a full-scale (amplitude 1) signal's dBFS at the 0 ceiling", async () => {
    fakeAnalyserAmplitude = 1;
    const recorder = createWebRecorder();
    await recorder.startRecording();
    const status = recorder.pollStatus();
    // RMS of an all-1s buffer is 1 -> 20*log10(1) = 0dBFS exactly, already
    // at the ceiling; the clamp guards a would-be-clipped signal from
    // reporting anything above 0.
    expect(status?.metering).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// releaseRecording — revoke + registry cleanup.
// ---------------------------------------------------------------------------
describe("releaseRecording", () => {
  it("revokes the object URL and clears the registry entry", async () => {
    const recorder = createWebRecorder();
    await recorder.startRecording();
    const { uri } = await recorder.stopRecording();
    expect(getRecordingBlob(uri)).not.toBeNull();

    releaseRecording(uri);
    expect(revokeObjectURLMock).toHaveBeenCalledWith(uri);
    expect(getRecordingBlob(uri)).toBeNull();
  });

  it("getRecordingBlob returns null for an unknown uri", () => {
    expect(getRecordingBlob("blob:never-registered")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// MediaRecorder undefined -> recorder_unavailable gate.
// ---------------------------------------------------------------------------
describe("MediaRecorder unavailable", () => {
  it("pickRecorderMimeType() is null and startRecording() rejects with recorder_unavailable", async () => {
    vi.stubGlobal("MediaRecorder", undefined);
    expect(pickRecorderMimeType()).toBeNull();

    const recorder = createWebRecorder();
    await expect(recorder.startRecording()).rejects.toThrow("recorder_unavailable");
  });
});
