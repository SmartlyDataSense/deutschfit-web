/**
 * MediaRecorder + AnalyserNode adapter satisfying the `NativeRecorder`
 * contract that `useRecorder` (`@/learner/sprechen/hooks/useRecorder`)
 * depends on. The only platform-specific file in the Sprechen recorder
 * port (P4).
 *
 * Web analog of deutschfit-mobile's `resolveNativeRecorder` /
 * `adaptExpoAudio`
 * (`deutschfit-mobile/src/features/sprechen/hooks/useRecorder.ts:117-206`)
 * — same `NativeRecorder` member shapes, swapping the expo-audio native
 * module for `MediaRecorder` (capture) + `AudioContext`/`AnalyserNode`
 * (metering).
 *
 * mimeType negotiation: `"audio/webm;codecs=opus"` -> `"audio/webm"` ->
 * `"audio/mp4"`, first `MediaRecorder.isTypeSupported` hit wins. Metering:
 * `getFloatTimeDomainData` -> RMS -> `dBFS = 20 * log10(rms)`, clamped to
 * `[-60, 0]` — feeds the shared `normalizeMetering` window in the hook
 * unchanged. The stopped recording is exposed as a `Blob` + its real
 * negotiated mime type through a `uri` (object URL)-keyed module-level
 * registry, so the upload step (P3) can read `getRecordingBlob(uri)` and
 * send `content-type: <blob.type>` — never a hardcoded value —  and
 * `releaseRecording(uri)` revokes the object URL once the caller is done
 * with it.
 */
import type { NativeRecorder } from "../hooks/useRecorder";

const MIME_TYPE_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

/**
 * First `MediaRecorder.isTypeSupported` hit, in priority order; `null`
 * when `MediaRecorder` itself is unavailable (SSR / unsupported browser)
 * or none of the candidates are supported.
 */
export function pickRecorderMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const type of MIME_TYPE_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return null;
}

/** Module-level `uri -> {blob, mimeType}` registry (P4). */
const registry = new Map<string, { blob: Blob; mimeType: string }>();

/** Look up the `Blob` + real negotiated mime type behind a recorder `uri`. */
export function getRecordingBlob(uri: string): { blob: Blob; mimeType: string } | null {
  return registry.get(uri) ?? null;
}

/** Revoke the object URL and drop it from the registry. */
export function releaseRecording(uri: string): void {
  URL.revokeObjectURL(uri);
  registry.delete(uri);
}

/** Clamp a dBFS value to [-60, 0]; non-finite input floors to -60 (silence). */
function clampDbfs(value: number): number {
  if (!Number.isFinite(value)) return -60;
  return Math.min(0, Math.max(-60, value));
}

/**
 * Build a `NativeRecorder` backed by `MediaRecorder` + an
 * `AudioContext`/`AnalyserNode` metering tap. Unlike mobile's
 * `resolveNativeRecorder`, this never returns `null` — constructing the
 * adapter object touches no browser API. The "this browser can't record at
 * all" case (no `MediaRecorder`, or `isTypeSupported` rejects every
 * candidate) is only detectable once recording actually starts, so
 * `startRecording()` throws `Error("recorder_unavailable")` at that point;
 * see the hook's `start()` for how that message is preserved rather than
 * collapsed into the generic `start_failed` path (Web delta).
 */
export function createWebRecorder(): NativeRecorder {
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let audioContext: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let meterBuffer: Float32Array<ArrayBuffer> | null = null;
  let chunks: BlobPart[] = [];
  let negotiatedMimeType: string | null = null;
  let startedAt = 0;

  const teardownStream = () => {
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
  };

  const teardownAudioContext = () => {
    const ctx = audioContext;
    audioContext = null;
    analyser = null;
    meterBuffer = null;
    if (ctx && ctx.state !== "closed") {
      void ctx.close().catch(() => {
        // Non-fatal — the context is being discarded regardless.
      });
    }
  };

  return {
    async requestPermissions() {
      try {
        const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
        // This call is a permission probe only — release the tracks
        // immediately, `startRecording()` acquires its own stream.
        probe.getTracks().forEach((track) => track.stop());
        return { granted: true };
      } catch (err) {
        if (err instanceof Error && err.name === "NotAllowedError") {
          return { granted: false };
        }
        throw err;
      }
    },

    async startRecording() {
      const mimeType = pickRecorderMimeType();
      if (!mimeType) {
        throw new Error("recorder_unavailable");
      }
      negotiatedMimeType = mimeType;
      chunks = [];
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      recorder = new MediaRecorder(stream, { mimeType });
      recorder.addEventListener("dataavailable", (event: BlobEvent) => {
        if (event.data && event.data.size > 0) chunks.push(event.data);
      });

      audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      analyser = audioContext.createAnalyser();
      meterBuffer = new Float32Array(analyser.fftSize);
      source.connect(analyser);

      startedAt = performance.now();
      recorder.start();
    },

    async stopRecording() {
      if (!recorder || !stream) {
        throw new Error("recorder_not_started");
      }
      const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
      const mimeType = negotiatedMimeType ?? "audio/webm";
      const activeRecorder = recorder;

      const blob = await new Promise<Blob>((resolve) => {
        activeRecorder.addEventListener(
          "stop",
          () => resolve(new Blob(chunks, { type: mimeType })),
          { once: true }
        );
        activeRecorder.stop();
      });

      teardownStream();
      teardownAudioContext();
      recorder = null;
      chunks = [];

      const uri = URL.createObjectURL(blob);
      registry.set(uri, { blob, mimeType });
      return { uri, durationMs };
    },

    pollStatus() {
      if (!recorder) return null;
      const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
      let metering: number | null = null;
      if (analyser && meterBuffer) {
        analyser.getFloatTimeDomainData(meterBuffer);
        let sumSquares = 0;
        for (let i = 0; i < meterBuffer.length; i++) {
          const sample = meterBuffer[i] ?? 0;
          sumSquares += sample * sample;
        }
        const rms = Math.sqrt(sumSquares / meterBuffer.length);
        metering = rms > 0 ? clampDbfs(20 * Math.log10(rms)) : -60;
      }
      return { durationMs, metering };
    },
  };
}
