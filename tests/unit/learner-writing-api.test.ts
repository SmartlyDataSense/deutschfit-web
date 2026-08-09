/**
 * `listPrompts` / `createPrompt` / `submitWriting` / `getWritingSubmission`
 * — S6 · Task 6.2.
 *
 * Port of `deutschfit-mobile/src/features/writing/api.ts`'s test surface,
 * adapted for the web transport (`invokeFn`/`ApiError` instead of
 * `supabase.functions.invoke`'s `{data,error}` envelope; `loadContent`/
 * `invalidateContentCache` instead of the mobile Drizzle content cache).
 *
 * Mocks only the transport boundaries (`@/learner/core/api/client`,
 * `@/learner/core/content/loadContent`, `@/learner/core/api/submissions`)
 * per Constraint 15 / this repo's test idiom — `writing.ts` itself runs for
 * real so the assertions exercise the actual wiring, not a stub echo.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// `vi.hoisted` — `vi.mock` factories are hoisted above the rest of the
// module, so the mock fns (and the synthetic `ApiError`, which must be
// `instanceof`-compatible with what `writing.ts` imports from the mocked
// `./client`) must be built via `vi.hoisted`, not plain top-level `const`s.
const {
  invokeFnMock,
  ApiErrorCtor,
  loadContentMock,
  invalidateContentCacheMock,
  getSubmissionMock,
} = vi.hoisted(() => {
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
    loadContentMock: vi.fn(),
    invalidateContentCacheMock: vi.fn(),
    getSubmissionMock: vi.fn(),
  };
});

vi.mock("@/learner/core/api/client", () => ({
  invokeFn: invokeFnMock,
  ApiError: ApiErrorCtor,
  newIdempotencyKey: () => crypto.randomUUID(),
}));

vi.mock("@/learner/core/content/loadContent", () => ({
  loadContent: loadContentMock,
  invalidateContentCache: invalidateContentCacheMock,
}));

vi.mock("@/learner/core/api/submissions", () => ({
  getSubmission: getSubmissionMock,
}));

import {
  createPrompt,
  getWritingSubmission,
  listPrompts,
  promptsCacheKey,
  submitWriting,
  type CreatePromptInput,
  type CreateSubmissionResult,
  type DimensionScoreWire,
  type DimensionScoresJson,
  type Feedback,
  type SubmitWritingResult,
  type WritingPrompt,
  type WritingSubmission,
} from "@/learner/core/api/writing";
import type { SubmitError, SubmitErrorKind } from "@/learner/core/api/writingErrors";
import * as examApi from "@/learner/core/api/examApi";
// Aliased so the block below proves the *facade* resolves these type names
// (Constraint 15), distinct from the direct `./writing` import above used
// to build test fixtures.
import type {
  CreatePromptInput as FacadeCreatePromptInput,
  CreateSubmissionResult as FacadeCreateSubmissionResult,
  DimensionScoreWire as FacadeDimensionScoreWire,
  DimensionScoresJson as FacadeDimensionScoresJson,
  Feedback as FacadeFeedback,
  PollingStatus as FacadePollingStatus,
  SubmitWritingResult as FacadeSubmitWritingResult,
  WritingPrompt as FacadeWritingPrompt,
  WritingSubmission as FacadeWritingSubmission,
} from "@/learner/core/api/examApi";
import type {
  SubmitError as FacadeSubmitError,
  SubmitErrorKind as FacadeSubmitErrorKind,
} from "@/learner/core/api/examApi";

function samplePrompt(overrides: Partial<WritingPrompt> = {}): WritingPrompt {
  return {
    id: "p1",
    exam_board: "telc",
    teil: 1,
    slug: "telc-b1-t1",
    title_de: "Ein Brief",
    situation_de: "Schreib einen Brief an einen Freund.",
    bullet_points: ["Punkt 1", "Punkt 2"],
    min_words: 80,
    max_words: 150,
    source: "official",
    ...overrides,
  };
}

describe("listPrompts", () => {
  beforeEach(() => {
    loadContentMock.mockReset();
  });

  it("computes the parametrized cache key and issues a body-less GET", async () => {
    loadContentMock.mockResolvedValueOnce({
      data: { prompts: [samplePrompt()] },
      fromCache: false,
      stale: false,
    });

    const prompts = await listPrompts("telc", "b1");

    expect(promptsCacheKey("telc", "b1")).toBe("prompts-list:writing:telc:b1");
    expect(loadContentMock).toHaveBeenCalledWith({
      fnName: "prompts-list",
      cacheKey: "prompts-list:writing:telc:b1",
      method: "GET",
    });
    // Body-less: the options object handed to `loadContent` carries no `body` key at all.
    expect(loadContentMock.mock.calls[0]![0]).not.toHaveProperty("body");
    expect(prompts).toHaveLength(1);
    expect(prompts[0]!.slug).toBe("telc-b1-t1");
  });

  it("falls back to an empty array when the payload has no prompts key", async () => {
    loadContentMock.mockResolvedValueOnce({ data: {}, fromCache: false, stale: false });
    const prompts = await listPrompts("goethe", "a2");
    expect(prompts).toEqual([]);
  });
});

describe("createPrompt", () => {
  const input: CreatePromptInput = {
    examBoard: "telc",
    teil: 2,
    titleDe: "Ein Brief",
    minWords: 80,
    maxWords: 150,
  };

  beforeEach(() => {
    invokeFnMock.mockReset();
    invalidateContentCacheMock.mockReset();
    invalidateContentCacheMock.mockResolvedValue(undefined);
  });

  it("posts a snake_case body and awaits invalidateContentCache with the exact active-context key", async () => {
    const created = samplePrompt({ id: "new-1", source: "community" });
    invokeFnMock.mockResolvedValueOnce({ prompt: created });

    const result = await createPrompt(input, { examBoard: "telc", examLevel: "b1" });

    expect(invokeFnMock).toHaveBeenCalledWith("prompt-create", {
      method: "POST",
      body: {
        exam_board: "telc",
        teil: 2,
        title_de: "Ein Brief",
        min_words: 80,
        max_words: 150,
      },
    });
    // `invalidate` targets the ACTIVE context, not the prompt's own board —
    // proves the fn doesn't derive the key from `input.examBoard`.
    expect(invalidateContentCacheMock).toHaveBeenCalledWith("prompts-list:writing:telc:b1");
    expect(result).toEqual(created);
  });

  it("only invalidates the active-context key, not the prompt's own board (Web delta P2 residual)", async () => {
    invokeFnMock.mockResolvedValueOnce({ prompt: samplePrompt({ exam_board: "goethe" }) });
    await createPrompt({ ...input, examBoard: "goethe" }, { examBoard: "telc", examLevel: "b1" });
    expect(invalidateContentCacheMock).toHaveBeenCalledTimes(1);
    expect(invalidateContentCacheMock).toHaveBeenCalledWith("prompts-list:writing:telc:b1");
  });

  it("throws Error(serverCode) on an ApiError from invokeFn", async () => {
    invokeFnMock.mockRejectedValueOnce(new ApiErrorCtor(400, "invalid_payload"));
    await expect(createPrompt(input, { examBoard: "telc", examLevel: "b1" })).rejects.toThrow(
      "invalid_payload"
    );
    expect(invalidateContentCacheMock).not.toHaveBeenCalled();
  });

  it("throws prompt_create_empty_response on a malformed 2xx body", async () => {
    invokeFnMock.mockResolvedValueOnce({} as never);
    await expect(createPrompt(input, { examBoard: "telc", examLevel: "b1" })).rejects.toThrow(
      "prompt_create_empty_response"
    );
  });

  it("throws the server's 2xx {error} envelope code", async () => {
    invokeFnMock.mockResolvedValueOnce({ error: "db_write_failed" });
    await expect(createPrompt(input, { examBoard: "telc", examLevel: "b1" })).rejects.toThrow(
      "db_write_failed"
    );
  });
});

describe("submitWriting", () => {
  beforeEach(() => {
    invokeFnMock.mockReset();
  });

  it("ok-path returns { ok: true, value } and generates a fresh UUID Idempotency-Key per call", async () => {
    invokeFnMock.mockResolvedValueOnce({ id: "sub-1", status: "pending" });
    invokeFnMock.mockResolvedValueOnce({ id: "sub-2", status: "pending" });

    const first: SubmitWritingResult = await submitWriting({ promptId: "p1", bodyDe: "Text 1" });
    const second: SubmitWritingResult = await submitWriting({ promptId: "p1", bodyDe: "Text 2" });

    const firstExpected: CreateSubmissionResult = { id: "sub-1", status: "pending" };
    const secondExpected: CreateSubmissionResult = { id: "sub-2", status: "pending" };
    expect(first).toEqual({ ok: true, value: firstExpected });
    expect(second).toEqual({ ok: true, value: secondExpected });

    const firstKey = (invokeFnMock.mock.calls[0]![1] as { idempotencyKey: string }).idempotencyKey;
    const secondKey = (invokeFnMock.mock.calls[1]![1] as { idempotencyKey: string }).idempotencyKey;
    expect(firstKey).toMatch(/^[0-9a-f-]{36}$/i);
    expect(secondKey).toMatch(/^[0-9a-f-]{36}$/i);
    expect(firstKey).not.toBe(secondKey);
  });

  it("ApiError 400 too_short maps through mapSubmissionError to a discriminated error result", async () => {
    invokeFnMock.mockRejectedValueOnce(
      new ApiErrorCtor(400, "too_short", undefined, { error: "too_short", min: 80 })
    );

    const result = await submitWriting({ promptId: "p1", bodyDe: "kurz" });

    const expected: SubmitWritingResult = { ok: false, error: { kind: "too_short", min: 80 } };
    expect(result).toEqual(expected);
  });

  it("a thrown non-ApiError (transport failure) maps to network", async () => {
    invokeFnMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const result = await submitWriting({ promptId: "p1", bodyDe: "Text" });

    const expectedKind: SubmitErrorKind = "network";
    const expected: SubmitWritingResult = { ok: false, error: { kind: expectedKind } };
    expect(result).toEqual(expected);
  });

  it("2xx {error} envelope maps like a 400", async () => {
    invokeFnMock.mockResolvedValueOnce({ error: "body_language_not_german" });

    const result = await submitWriting({ promptId: "p1", bodyDe: "This is English" });

    const expectedError: SubmitError = { kind: "body_language_not_german" };
    expect(result).toEqual({ ok: false, error: expectedError });
  });
});

describe("getWritingSubmission", () => {
  beforeEach(() => {
    getSubmissionMock.mockReset();
  });

  it('delegates to getSubmission(id, "writing")', async () => {
    const feedback: Feedback = { model_answer_de: "Model answer" };
    const dimensionScoresJson: DimensionScoresJson = {
      inhalt: { score: 3, pct: 60, max: 5 } satisfies DimensionScoreWire,
    };
    const remote: WritingSubmission = {
      id: "sub-1",
      user_id: "u1",
      prompt_id: "p1",
      body_de: "Text",
      word_count: 40,
      status: "graded",
      score_inhalt: null,
      score_wortschatz_gram: null,
      score_kommunikation: null,
      feedback_json: feedback,
      grader_version: "v2",
      model_name: "gpt",
      graded_at: "2026-08-09T00:00:00.000Z",
      error_message: null,
      created_at: "2026-08-08T00:00:00.000Z",
      dimension_scores_json: dimensionScoresJson,
    };
    getSubmissionMock.mockResolvedValueOnce(remote);

    const result = await getWritingSubmission("sub-1");

    expect(getSubmissionMock).toHaveBeenCalledWith("sub-1", "writing");
    expect(result.id).toBe("sub-1");
    expect(result.status).toBe("graded");
    expect(result.dimension_scores_json).toEqual(dimensionScoresJson);
  });
});

describe("facade re-exports (examApi)", () => {
  it("resolves the writing wire functions from the facade — identical references, not re-implementations", () => {
    expect(examApi.listPrompts).toBe(listPrompts);
    expect(examApi.promptsCacheKey).toBe(promptsCacheKey);
    expect(examApi.createPrompt).toBe(createPrompt);
    expect(examApi.submitWriting).toBe(submitWriting);
    expect(examApi.getWritingSubmission).toBe(getWritingSubmission);
  });

  it("resolves the error-mapping surface from the facade", () => {
    expect(typeof examApi.mapSubmissionError).toBe("function");
    expect(typeof examApi.logSubmitError).toBe("function");
  });

  it("type-level: every writing + error type resolves through the facade (compile-time; npm run typecheck enforces this)", () => {
    // Each assignment below only compiles if the aliased `Facade*` type
    // (imported from `@/learner/core/api/examApi`) is structurally
    // identical to its canonical counterpart from `./writing` /
    // `./writingErrors` — i.e. the facade genuinely re-exports the same
    // shape, not a stale or divergent copy.
    const prompt: FacadeWritingPrompt = samplePrompt();
    const pollingStatus: FacadePollingStatus = "timeout";
    const createInput: FacadeCreatePromptInput = {
      examBoard: "telc",
      teil: 1,
      titleDe: "t",
      minWords: 80,
      maxWords: 150,
    };
    const createResult: FacadeCreateSubmissionResult = { id: "id", status: "pending" };
    const submitResult: FacadeSubmitWritingResult = { ok: true, value: createResult };
    const dimFlat: FacadeDimensionScoresJson = { inhalt: 3 };
    const dimWire: FacadeDimensionScoreWire = { score: 3, pct: 60, max: 5 };
    const feedback: FacadeFeedback = { model_answer_de: "x" };
    const submission: FacadeWritingSubmission = {
      id: "id",
      user_id: "u",
      prompt_id: "p",
      body_de: "b",
      word_count: 10,
      status: "graded",
      score_inhalt: null,
      score_wortschatz_gram: null,
      score_kommunikation: null,
      feedback_json: null,
      grader_version: null,
      model_name: null,
      graded_at: null,
      error_message: null,
      created_at: "2026-08-09T00:00:00.000Z",
    };
    const err: FacadeSubmitError = { kind: "network" };
    const errKind: FacadeSubmitErrorKind = "network";

    // Non-tautological: assert real field values, not just that the
    // assignment compiled.
    expect(prompt.slug).toBe("telc-b1-t1");
    expect(pollingStatus).toBe("timeout");
    expect(createInput.examBoard).toBe("telc");
    expect(createResult.status).toBe("pending");
    expect(submitResult.ok).toBe(true);
    expect(dimFlat.inhalt).toBe(3);
    expect(dimWire.max).toBe(5);
    expect(feedback.model_answer_de).toBe("x");
    expect(submission.status).toBe("graded");
    expect(err.kind).toBe("network");
    expect(errKind).toBe("network");
  });
});
