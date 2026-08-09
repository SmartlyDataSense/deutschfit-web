import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeFnMock, rawGetMock, ApiErrorCtor } = vi.hoisted(() => {
  // Mirror of src/learner/core/api/client.ts ApiError AFTER this task's additive edit.
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
  return { invokeFnMock: vi.fn(), rawGetMock: vi.fn(), ApiErrorCtor: ApiError };
});
vi.mock("@/learner/core/api/client", () => ({
  invokeFn: invokeFnMock,
  rawGet: rawGetMock,
  ApiError: ApiErrorCtor,
}));

import { __resetLearnerDbForTests, getLearnerDb } from "@/learner/core/db";
import {
  listModelltests,
  MockExamInProgressError,
  startMockExam,
} from "@/learner/core/api/mockExam";
import { resumeMockExam, submitLesen } from "@/learner/core/api/examApi";
import { startSession } from "@/learner/core/exam/mockExamSession";

const inProgress409 = () =>
  new ApiErrorCtor(409, "mock_in_progress", undefined, {
    error: "mock_in_progress",
    mock_attempt_id: "m1",
    status: "in_progress",
  });

describe("mockExam wire client + session service", () => {
  beforeEach(() => {
    __resetLearnerDbForTests();
    invokeFnMock.mockReset();
    rawGetMock.mockReset();
  });

  it("listModelltests hits modelltests-list?module=LESEN and maps rows", async () => {
    rawGetMock.mockResolvedValueOnce({
      modelltests: [
        {
          id: "1",
          slug: "t1",
          title: "T",
          cert_code: "telc",
          level_code: "b1",
          short_label: "MT 1",
          sequence_num: 1,
          module_code: "LESEN",
        },
      ],
    });
    const rows = await listModelltests({ module: "LESEN" });
    expect(rows[0]!.slug).toBe("t1");
    expect(rawGetMock).toHaveBeenCalledWith("modelltests-list", { module: "LESEN" });
  });

  it("startMockExam: 201 body without status defaults to in_progress/created", async () => {
    invokeFnMock.mockResolvedValueOnce({
      mock_attempt_id: "m2",
      exam_slug: "t1",
      next_module: "LESEN",
      lesen_attempt_id: "la1",
    });
    const res = await startMockExam({ examSlug: "t1" });
    expect(res).toMatchObject({
      mockAttemptId: "m2",
      examSlug: "t1",
      status: "in_progress",
      nextModule: "LESEN",
      lesenAttemptId: "la1",
      created: true,
    });
  });

  it('startMockExam({examSlug, module:"SCHREIBEN"}) on a 201 body without status defaults to "hoeren_done"', async () => {
    invokeFnMock.mockResolvedValueOnce({
      mock_attempt_id: "m3",
      exam_slug: "t1",
      next_module: null,
    });
    const res = await startMockExam({ examSlug: "t1", module: "SCHREIBEN" });
    expect(invokeFnMock).toHaveBeenCalledWith("mock-exam-start", {
      method: "POST",
      body: { exam_slug: "t1", module: "SCHREIBEN" },
    });
    expect(res).toMatchObject({ mockAttemptId: "m3", status: "hoeren_done", created: true });
  });

  it('startMockExam({examSlug, module:"SPRECHEN"}) on a 201 body without status defaults to "schreiben_done"', async () => {
    invokeFnMock.mockResolvedValueOnce({
      mock_attempt_id: "m4",
      exam_slug: "t1",
      next_module: null,
    });
    const res = await startMockExam({ examSlug: "t1", module: "SPRECHEN" });
    expect(res).toMatchObject({ mockAttemptId: "m4", status: "schreiben_done", created: true });
  });

  it('startMockExam({examSlug}) with module omitted (full-mock path, mockExam.ts:468) still defaults to "in_progress"', async () => {
    invokeFnMock.mockResolvedValueOnce({
      mock_attempt_id: "m5",
      exam_slug: "t1",
      next_module: "LESEN",
    });
    const res = await startMockExam({ examSlug: "t1" });
    expect(invokeFnMock).toHaveBeenCalledWith("mock-exam-start", {
      method: "POST",
      body: { exam_slug: "t1" },
    });
    expect(res).toMatchObject({ mockAttemptId: "m5", status: "in_progress", created: true });
  });

  it("startMockExam 409 mock_in_progress → typed MockExamInProgressError from bodyJson", async () => {
    invokeFnMock.mockRejectedValueOnce(inProgress409());
    await expect(startMockExam({ examSlug: "t1" })).rejects.toBeInstanceOf(MockExamInProgressError);
  });

  it("resumeMockExam converts the 409 into a full StartMockExamResult", async () => {
    invokeFnMock.mockRejectedValueOnce(inProgress409());
    const res = await resumeMockExam({ examSlug: "t1" });
    expect(res).toMatchObject({
      created: false,
      mockAttemptId: "m1",
      examSlug: "t1",
      status: "in_progress",
      nextModule: "LESEN",
      lesenAttemptId: null,
    });
  });

  it("submitLesen 429 rethrows mobile's rate_limited string (P1 contract)", async () => {
    invokeFnMock.mockRejectedValueOnce(
      new ApiErrorCtor(429, "rate_limited", undefined, { error: "rate_limited", reset: "24h" })
    );
    await expect(submitLesen({ attemptId: "a1", answers: {} })).rejects.toThrow("rate_limited");
  });

  it("startSession upserts the Dexie mockExamCache row (examSlug → modelltest_slug)", async () => {
    invokeFnMock.mockResolvedValueOnce({
      mock_attempt_id: "m2",
      exam_slug: "t1",
      next_module: "LESEN",
      lesen_attempt_id: "la1",
    });
    const handle = await startSession({ userId: "u1", examSlug: "t1" }, 1000);
    expect(handle).toMatchObject({ mockAttemptId: "m2", lesenAttemptId: "la1", resumed: false });
    const db = await getLearnerDb();
    const row = await db.mockExamCache.get(["u1", "t1"]);
    expect(row).toMatchObject({ mock_attempt_id: "m2", status: "in_progress" });
  });
});
