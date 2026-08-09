/**
 * `mapSubmissionError` / `logSubmitError` — S6 · Task 6.2.
 *
 * Port of `deutschfit-mobile/src/features/writing/submitErrors.ts`'s test
 * surface, adapted for the web `ApiError` transport (status + bodyJson,
 * no response headers — `retry_after_seconds` is always `undefined` here,
 * Web delta P4).
 */
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/learner/core/api/client";
import { logSubmitError, mapSubmissionError } from "@/learner/core/api/writingErrors";

describe("mapSubmissionError (web port of mobile submitErrors.ts)", () => {
  it("no HTTP response at all (non-ApiError throw) maps to network", async () => {
    await expect(mapSubmissionError(new TypeError("Failed to fetch"))).resolves.toEqual({
      kind: "network",
    });
  });

  it("ApiError with status 0 maps to network", async () => {
    const err = new ApiError(0, "unreachable");
    await expect(mapSubmissionError(err)).resolves.toEqual({ kind: "network" });
  });

  it("wasNetworkFailure overrides any status to network", async () => {
    const err = new ApiError(500, "server_error");
    await expect(mapSubmissionError(err, { wasNetworkFailure: true })).resolves.toEqual({
      kind: "network",
    });
  });

  it("503 maps to server with the real status", async () => {
    const err = new ApiError(503, "service_unavailable");
    await expect(mapSubmissionError(err)).resolves.toEqual({ kind: "server", status: 503 });
  });

  it("429 maps to rate_limit_exceeded with retry_after_seconds always undefined (no headers on ApiError)", async () => {
    const err = new ApiError(429, "rate_limited");
    await expect(mapSubmissionError(err)).resolves.toEqual({
      kind: "rate_limit_exceeded",
      retry_after_seconds: undefined,
    });
  });

  it("409 maps to idempotency_replay", async () => {
    const err = new ApiError(409, "idempotency_replay");
    await expect(mapSubmissionError(err)).resolves.toEqual({ kind: "idempotency_replay" });
  });

  it("400 + body_language_not_german maps to body_language_not_german", async () => {
    const err = new ApiError(400, "body_language_not_german", undefined, {
      error: "body_language_not_german",
    });
    await expect(mapSubmissionError(err)).resolves.toEqual({ kind: "body_language_not_german" });
  });

  it("400 + too_short carries the server-provided min bound", async () => {
    const err = new ApiError(400, "too_short", undefined, { error: "too_short", min: 80 });
    await expect(mapSubmissionError(err)).resolves.toEqual({ kind: "too_short", min: 80 });
  });

  it("400 + too_long carries the server-provided max bound", async () => {
    const err = new ApiError(400, "too_long", undefined, { error: "too_long", max: 600 });
    await expect(mapSubmissionError(err)).resolves.toEqual({ kind: "too_long", max: 600 });
  });

  it("400 with an unrecognized code maps to validation_failed, field carries the code", async () => {
    const err = new ApiError(400, "some_new_gate", undefined, { error: "some_new_gate" });
    await expect(mapSubmissionError(err)).resolves.toEqual({
      kind: "validation_failed",
      field: "some_new_gate",
    });
  });

  it("400 with no parseable body code maps to validation_failed with field undefined", async () => {
    const err = new ApiError(400, "bad_request");
    await expect(mapSubmissionError(err)).resolves.toEqual({
      kind: "validation_failed",
      field: undefined,
    });
  });

  it("418 (unmapped status) maps to unknown, raw excerpt truncated at 200 chars", async () => {
    const longMessage = "x".repeat(500);
    const err = new ApiError(418, "im_a_teapot", undefined, { message: longMessage });
    const result = await mapSubmissionError(err);
    expect(result.kind).toBe("unknown");
    if (result.kind !== "unknown") throw new Error("unreachable");
    expect(result.status).toBe(418);
    expect(result.raw).toBeDefined();
    // 200 chars of stringified JSON + the truncation ellipsis.
    expect(result.raw!.endsWith("…")).toBe(true);
    expect(result.raw!.length).toBe(201);
  });

  it("418 with no body has raw undefined", async () => {
    const err = new ApiError(418, "im_a_teapot");
    const result = await mapSubmissionError(err);
    expect(result).toEqual({ kind: "unknown", status: 418, raw: undefined });
  });
});

describe("logSubmitError (web port)", () => {
  it("never includes a body/bodyDe field in the warn payload, for any error kind", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const allKinds: Parameters<typeof logSubmitError>[0][] = [
      { kind: "network" },
      { kind: "body_language_not_german" },
      { kind: "too_short", min: 80 },
      { kind: "too_long", max: 600 },
      { kind: "rate_limit_exceeded", retry_after_seconds: 30 },
      { kind: "idempotency_replay" },
      { kind: "validation_failed", field: "some_new_gate" },
      { kind: "server", status: 503 },
      { kind: "unknown", status: 418, raw: "excerpt" },
    ];

    for (const err of allKinds) {
      logSubmitError(err);
    }

    expect(warnSpy).toHaveBeenCalledTimes(allKinds.length);
    for (const call of warnSpy.mock.calls) {
      const payload = JSON.stringify(call);
      expect(payload).not.toContain("bodyDe");
      expect(payload.toLowerCase()).not.toMatch(/"body"\s*:/);
    }
    // Sanity: the prefix + kind actually land in the payload (non-tautological —
    // proves the spy captured real content, not just call count).
    expect(warnSpy.mock.calls[0]).toEqual(["[writing-submit]", { kind: "network" }]);
    expect(warnSpy.mock.calls[2]).toEqual(["[writing-submit]", { kind: "too_short", min: 80 }]);

    warnSpy.mockRestore();
  });
});
