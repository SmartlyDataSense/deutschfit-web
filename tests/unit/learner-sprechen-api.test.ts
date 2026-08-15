/**
 * `reserveUpload` / `putAudio` / `finalize` / `getSprechenAudioUrl` /
 * `getSprechenSubmission` — S7 · Task 7.1.
 *
 * Port of `deutschfit-mobile/src/features/sprechen/api.ts`'s test surface,
 * adapted for the web transport (`invokeFn`/`ApiError` instead of
 * `supabase.functions.invoke`'s `{data,error}` envelope). `putAudio` uses a
 * plain `fetch` PUT — the negotiated blob `content-type` (P3), never
 * mobile's hardcoded `audio/mp4`.
 *
 * Mocks only the transport boundaries (`@/learner/core/api/client`,
 * `@/learner/core/api/submissions`, global `fetch`) per Constraint 15 /
 * this repo's test idiom — `sprechen.ts` itself runs for real.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invokeFnMock, ApiErrorCtor, getSubmissionMock } = vi.hoisted(() => {
  class ApiError extends Error {
    readonly bodyJson?: unknown;
    constructor(
      readonly status: number,
      readonly code: string,
      readonly detail?: string,
      bodyJson?: unknown
    ) {
      super(detail ?? code);
      this.name = "ApiError";
      this.bodyJson = bodyJson;
    }
  }
  return {
    invokeFnMock: vi.fn(),
    ApiErrorCtor: ApiError,
    getSubmissionMock: vi.fn(),
  };
});

vi.mock("@/learner/core/api/client", () => ({
  invokeFn: invokeFnMock,
  ApiError: ApiErrorCtor,
}));

vi.mock("@/learner/core/api/submissions", () => ({
  getSubmission: getSubmissionMock,
}));

import {
  finalize,
  getSprechenAudioUrl,
  getSprechenSubmission,
  putAudio,
  reserveUpload,
  type FinalizeResult,
  type ReserveUploadResult,
  type SprechenSubmission,
} from "@/learner/core/api/sprechen";
import * as examApi from "@/learner/core/api/examApi";
import type {
  FinalizeResult as FacadeFinalizeResult,
  ReserveUploadResult as FacadeReserveUploadResult,
  SprechenPollingStatus as FacadeSprechenPollingStatus,
  SprechenStatus as FacadeSprechenStatus,
  SprechenSubmission as FacadeSprechenSubmission,
  SprechenTeil as FacadeSprechenTeil,
} from "@/learner/core/api/examApi";

describe("reserveUpload", () => {
  beforeEach(() => {
    invokeFnMock.mockReset();
  });

  it("posts a snake_case body incl. client_submission_id", async () => {
    const result: ReserveUploadResult = {
      submission_id: "sub-1",
      signed_put_url: "https://storage.example/sub-1",
      storage_path: "user-1/sub-1.m4a",
      expires_in: 900,
    };
    invokeFnMock.mockResolvedValueOnce(result);

    const returned = await reserveUpload({
      examSlug: "goethe-b1-sprechen",
      teil: 2,
      clientSubmissionId: "client-1",
      cert: "GOETHE",
      level: "B1",
    });

    expect(invokeFnMock).toHaveBeenCalledWith("sprechen-upload", {
      method: "POST",
      body: {
        exam_slug: "goethe-b1-sprechen",
        teil: 2,
        client_submission_id: "client-1",
        cert: "GOETHE",
        level: "B1",
      },
    });
    expect(returned).toEqual(result);
  });

  it("omits absent optional cert/level", async () => {
    invokeFnMock.mockResolvedValueOnce({
      submission_id: "sub-2",
      signed_put_url: "https://storage.example/sub-2",
      storage_path: "user-1/sub-2.m4a",
      expires_in: 900,
    });

    await reserveUpload({
      examSlug: "goethe-b1-sprechen",
      teil: 1,
      clientSubmissionId: "client-2",
    });

    expect(invokeFnMock).toHaveBeenCalledWith("sprechen-upload", {
      method: "POST",
      body: {
        exam_slug: "goethe-b1-sprechen",
        teil: 1,
        client_submission_id: "client-2",
      },
    });
  });

  it("throws Error(serverCode) on an ApiError", async () => {
    invokeFnMock.mockRejectedValueOnce(new ApiErrorCtor(429, "rate_limited"));
    await expect(
      reserveUpload({ examSlug: "goethe-b1-sprechen", teil: 1, clientSubmissionId: "client-3" })
    ).rejects.toThrow("rate_limited");
  });
});

describe("putAudio", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("PUTs with the exact content-type header passed in", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));
    const blob = new Blob(["audio-bytes"], { type: "audio/webm;codecs=opus" });

    await putAudio("https://storage.example/put-url", blob, "audio/webm;codecs=opus");

    expect(fetchMock).toHaveBeenCalledWith("https://storage.example/put-url", {
      method: "PUT",
      headers: { "content-type": "audio/webm;codecs=opus" },
      body: blob,
    });
  });

  it("throws audio_upload_failed on a 403 response", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 403 }));
    const blob = new Blob(["audio-bytes"], { type: "audio/mp4" });

    await expect(putAudio("https://storage.example/put-url", blob, "audio/mp4")).rejects.toThrow(
      "audio_upload_failed"
    );
  });
});

describe("finalize", () => {
  beforeEach(() => {
    invokeFnMock.mockReset();
  });

  it("floors duration_sec and omits absent optionals", async () => {
    const result: FinalizeResult = { submission_id: "sub-1", status: "queued", replay: false };
    invokeFnMock.mockResolvedValueOnce(result);

    const returned = await finalize({ submissionId: "sub-1", durationSec: 62.9 });

    expect(invokeFnMock).toHaveBeenCalledWith("sprechen-finalize", {
      method: "POST",
      body: { submission_id: "sub-1", duration_sec: 62 },
    });
    expect(returned).toEqual(result);
  });

  it("includes subgenre/level/topic_id when provided", async () => {
    invokeFnMock.mockResolvedValueOnce({ submission_id: "sub-1", status: "queued", replay: false });

    await finalize({
      submissionId: "sub-1",
      subgenre: "praesentation",
      level: "B1",
      topicId: "topic-1",
      durationSec: 90,
    });

    expect(invokeFnMock).toHaveBeenCalledWith("sprechen-finalize", {
      method: "POST",
      body: {
        submission_id: "sub-1",
        subgenre: "praesentation",
        level: "B1",
        topic_id: "topic-1",
        duration_sec: 90,
      },
    });
  });

  it("never sends a custom_theme member (P14/anti-req 6)", async () => {
    invokeFnMock.mockResolvedValueOnce({ submission_id: "sub-1", status: "queued", replay: false });
    await finalize({ submissionId: "sub-1" });
    const body = invokeFnMock.mock.calls[0]![1] as { body: Record<string, unknown> };
    expect(body.body).not.toHaveProperty("custom_theme");
  });

  it("throws Error(serverCode) on an ApiError", async () => {
    invokeFnMock.mockRejectedValueOnce(new ApiErrorCtor(412, "audio_missing"));
    await expect(finalize({ submissionId: "sub-1" })).rejects.toThrow("audio_missing");
  });
});

describe("getSprechenAudioUrl", () => {
  beforeEach(() => {
    invokeFnMock.mockReset();
  });

  it("posts { submission_id } and returns { url, ttl_sec }", async () => {
    invokeFnMock.mockResolvedValueOnce({
      submission_id: "sub-1",
      url: "https://signed",
      ttl_sec: 600,
    });

    const result = await getSprechenAudioUrl("sub-1");

    expect(invokeFnMock).toHaveBeenCalledWith("sprechen-audio-url", {
      method: "POST",
      body: { submission_id: "sub-1" },
    });
    expect(result).toEqual({ url: "https://signed", ttl_sec: 600 });
  });
});

describe("getSprechenSubmission", () => {
  beforeEach(() => {
    getSubmissionMock.mockReset();
  });

  it('delegates to getSubmission(id, "speaking")', async () => {
    const remote: SprechenSubmission = {
      id: "sub-1",
      user_id: "u1",
      exam_slug: "goethe-b1-sprechen",
      teil: 1,
      status: "graded",
      audio_storage_path: "u1/sub-1.m4a",
      audio_duration_ms: 62000,
      transcript_de: "Ich möchte ...",
      feedback_json: null,
      score: 78,
      uploaded_at: "2026-08-09T00:00:00.000Z",
      graded_at: "2026-08-09T00:01:00.000Z",
      error_message: null,
      created_at: "2026-08-08T23:59:00.000Z",
    };
    getSubmissionMock.mockResolvedValueOnce(remote);

    const result = await getSprechenSubmission("sub-1");

    expect(getSubmissionMock).toHaveBeenCalledWith("sub-1", "speaking");
    expect(result.id).toBe("sub-1");
    expect(result.status).toBe("graded");
  });

  it("maps a 404 ApiError to Error(sprechen_not_found)", async () => {
    getSubmissionMock.mockRejectedValueOnce(new ApiErrorCtor(404, "not_found"));
    await expect(getSprechenSubmission("missing")).rejects.toThrow("sprechen_not_found");
  });

  it("passes through a non-404 ApiError code unchanged", async () => {
    getSubmissionMock.mockRejectedValueOnce(new ApiErrorCtor(403, "not_authorized"));
    await expect(getSprechenSubmission("sub-1")).rejects.toThrow("not_authorized");
  });
});

describe("facade re-exports (examApi)", () => {
  it("resolves the sprechen wire functions from the facade — identical references", () => {
    expect(examApi.reserveUpload).toBe(reserveUpload);
    expect(examApi.putAudio).toBe(putAudio);
    expect(examApi.finalize).toBe(finalize);
    expect(examApi.getSprechenAudioUrl).toBe(getSprechenAudioUrl);
    expect(examApi.getSprechenSubmission).toBe(getSprechenSubmission);
  });

  it("type-level: sprechen types resolve through the facade (compile-time; npm run typecheck enforces this)", () => {
    const teil: FacadeSprechenTeil = 3;
    const status: FacadeSprechenStatus = "rejected";
    const pollingStatus: FacadeSprechenPollingStatus = "timeout";
    const reserve: FacadeReserveUploadResult = {
      submission_id: "id",
      signed_put_url: "url",
      storage_path: "path",
      expires_in: 900,
    };
    const finalizeResult: FacadeFinalizeResult = {
      submission_id: "id",
      status: "queued",
      replay: false,
    };
    const submission: FacadeSprechenSubmission = {
      id: "id",
      user_id: "u",
      exam_slug: "goethe-b1-sprechen",
      teil: 1,
      status: "graded",
      audio_storage_path: null,
      audio_duration_ms: null,
      transcript_de: null,
      feedback_json: null,
      score: null,
      uploaded_at: null,
      graded_at: null,
      error_message: null,
      created_at: "2026-08-09T00:00:00.000Z",
    };

    expect(teil).toBe(3);
    expect(status).toBe("rejected");
    expect(pollingStatus).toBe("timeout");
    expect(reserve.expires_in).toBe(900);
    expect(finalizeResult.replay).toBe(false);
    expect(submission.status).toBe("graded");
  });
});
