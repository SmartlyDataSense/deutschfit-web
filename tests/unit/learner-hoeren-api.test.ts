import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";

const { invokeFnMock, ApiErrorCtor } = vi.hoisted(() => {
  // Mirror of src/learner/core/api/client.ts ApiError.
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
  return { invokeFnMock: vi.fn(), ApiErrorCtor: ApiError };
});
vi.mock("@/learner/core/api/client", () => ({
  invokeFn: invokeFnMock,
  rawGet: vi.fn(),
  ApiError: ApiErrorCtor,
}));

import { __resetLearnerDbForTests, getLearnerDb } from "@/learner/core/db";
import {
  fetchHoerenPracticeSession,
  fetchHoerenSession,
  startMockExam,
} from "@/learner/core/api/mockExam";
import { submitHoeren } from "@/learner/core/api/examApi";
import { startSession } from "@/learner/core/exam/mockExamSession";

const manifest = {
  modelltest: { slug: "t1", title: "T", short_label: "MT 1" },
  modules: [],
};
const hoerenModule = { module_code: "HOEREN" as const, source_slug: "t1", parts: [] };

describe("Hören wire clients (S5 · Task 5.1)", () => {
  beforeEach(() => {
    __resetLearnerDbForTests();
    invokeFnMock.mockReset();
  });
  afterEach(() => {
    cleanup();
  });

  it("fetchHoerenSession({examSlug}) posts hoeren-start {exam_slug} and maps the envelope", async () => {
    invokeFnMock.mockResolvedValueOnce({
      attempt_id: "ha1",
      exam_slug: "t1",
      manifest,
      module: hoerenModule,
    });
    const res = await fetchHoerenSession({ examSlug: "t1" });
    expect(invokeFnMock).toHaveBeenCalledWith("hoeren-start", {
      method: "POST",
      body: { exam_slug: "t1" },
    });
    expect(res).toMatchObject({ attemptId: "ha1", examSlug: "t1", module: hoerenModule });
  });

  it("fetchHoerenSession({attemptId}) posts hoeren-session-get {attempt_id} and ignores extra keys", async () => {
    invokeFnMock.mockResolvedValueOnce({
      attempt_id: "ha1",
      exam_slug: "t1",
      manifest,
      module: hoerenModule,
      answers: { q1: "a" },
      status: "lesen_done",
    });
    const res = await fetchHoerenSession({ attemptId: "ha1" });
    expect(invokeFnMock).toHaveBeenCalledWith("hoeren-session-get", {
      method: "POST",
      body: { attempt_id: "ha1" },
    });
    expect(res).toMatchObject({ attemptId: "ha1", examSlug: "t1", module: hoerenModule });
    expect(res).not.toHaveProperty("answers");
    expect(res).not.toHaveProperty("status");
  });

  it('fetchHoerenPracticeSession("B1", slug) posts {level, slug} and forces attemptId: null even when server echoes attempt_id', async () => {
    invokeFnMock.mockResolvedValueOnce({
      attempt_id: "should-be-ignored",
      exam_slug: "telc-b1-hoeren-01",
      manifest,
      module: hoerenModule,
    });
    const res = await fetchHoerenPracticeSession("B1", "telc-b1-hoeren-01");
    expect(invokeFnMock).toHaveBeenCalledWith("hoeren-practice-get", {
      method: "POST",
      body: { level: "B1", slug: "telc-b1-hoeren-01" },
    });
    expect(res.attemptId).toBeNull();
  });

  it("fetchHoerenSession malformed envelope throws Error(hoeren_start_malformed_response)", async () => {
    invokeFnMock.mockResolvedValueOnce({ exam_slug: "t1" }); // missing attempt_id/manifest/module
    await expect(fetchHoerenSession({ examSlug: "t1" })).rejects.toThrow(
      "hoeren_start_malformed_response"
    );
  });

  it("submitHoeren posts {attempt_id, answers} with null-valued answers preserved", async () => {
    invokeFnMock.mockResolvedValueOnce({ attempt_id: "ha1", raw_score: 3 });
    const answers = { q1: "a", q2: null };
    await submitHoeren({ attemptId: "ha1", answers });
    expect(invokeFnMock).toHaveBeenCalledWith("hoeren-submit", {
      method: "POST",
      body: { attempt_id: "ha1", answers },
    });
  });

  it("submitHoeren 429 surfaces as Error(rate_limited) via ApiError.bodyJson", async () => {
    invokeFnMock.mockRejectedValueOnce(
      new ApiErrorCtor(429, "rate_limited", undefined, { error: "rate_limited", reset: "24h" })
    );
    await expect(submitHoeren({ attemptId: "ha1", answers: {} })).rejects.toThrow("rate_limited");
  });

  it('startMockExam({examSlug, module:"HOEREN"}) sends module, parses hoerenAttemptId, defaults status lesen_done', async () => {
    invokeFnMock.mockResolvedValueOnce({
      mock_attempt_id: "m1",
      exam_slug: "t1",
      next_module: "HOEREN",
      hoeren_attempt_id: "ha1",
    });
    const res = await startMockExam({ examSlug: "t1", module: "HOEREN" });
    expect(invokeFnMock).toHaveBeenCalledWith("mock-exam-start", {
      method: "POST",
      body: { exam_slug: "t1", module: "HOEREN" },
    });
    expect(res).toMatchObject({ hoerenAttemptId: "ha1", status: "lesen_done" });
  });

  it("startMockExam({examSlug}) sends no module key and defaults status in_progress", async () => {
    invokeFnMock.mockResolvedValueOnce({
      mock_attempt_id: "m1",
      exam_slug: "t1",
      next_module: "LESEN",
      lesen_attempt_id: "la1",
    });
    const res = await startMockExam({ examSlug: "t1" });
    const call = invokeFnMock.mock.calls[0]!;
    expect(call[1].body).not.toHaveProperty("module");
    expect(res).toMatchObject({ status: "in_progress", hoerenAttemptId: null });
  });

  it('startSession({userId, examSlug, module:"HOEREN"}) returns a handle with hoerenAttemptId and status lesen_done', async () => {
    invokeFnMock.mockResolvedValueOnce({
      mock_attempt_id: "m1",
      exam_slug: "t1",
      next_module: "HOEREN",
      hoeren_attempt_id: "ha1",
    });
    const handle = await startSession({ userId: "u1", examSlug: "t1", module: "HOEREN" }, 1000);
    expect(handle).toMatchObject({ hoerenAttemptId: "ha1", status: "lesen_done", resumed: false });
    const db = await getLearnerDb();
    const row = await db.mockExamCache.get(["u1", "t1"]);
    expect(row).toMatchObject({ mock_attempt_id: "m1", status: "lesen_done" });
  });

  it("startSession 409 resume path yields hoerenAttemptId: null", async () => {
    invokeFnMock.mockRejectedValueOnce(
      new ApiErrorCtor(409, "mock_in_progress", undefined, {
        error: "mock_in_progress",
        mock_attempt_id: "m1",
        status: "lesen_done",
      })
    );
    const handle = await startSession({ userId: "u1", examSlug: "t1", module: "HOEREN" }, 1000);
    expect(handle).toMatchObject({ hoerenAttemptId: null, resumed: true, status: "lesen_done" });
  });
});
