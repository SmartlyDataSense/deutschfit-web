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

// Chainable `.from("mock_exam_attempts").select(...).eq("id", id).maybeSingle()`
// builder for `getMockAttempt` (S8 · Task 8.1) — mirrors the
// `learner-dialogue-api.test.ts` idiom for `cert_dialogue_teile` (S7),
// adapted for `.maybeSingle()` instead of `.order()`.
type MockAttemptChainResult = { data: unknown; error: unknown };
let mockAttemptResult: MockAttemptChainResult = { data: null, error: null };
const mockAttemptEq = vi.fn();
const mockAttemptSelect = vi.fn();
const mockAttemptMaybeSingle = vi.fn(() => Promise.resolve(mockAttemptResult));
const mockAttemptFrom = vi.fn(() => ({
  select: (...args: unknown[]) => {
    mockAttemptSelect(...args);
    return {
      eq: (...a: unknown[]) => {
        mockAttemptEq(...a);
        return { maybeSingle: mockAttemptMaybeSingle };
      },
    };
  },
}));

vi.mock("@/lib/supabase/browser", () => ({
  getBrowserClient: () => ({ from: mockAttemptFrom }),
}));

import { __resetLearnerDbForTests, getLearnerDb } from "@/learner/core/db";
import {
  getMockAttempt,
  listModelltests,
  MockExamInProgressError,
  startMockExam,
} from "@/learner/core/api/mockExam";
import {
  getMockAttempt as getMockAttemptFacade,
  nextModuleForStatus,
  resumeMockExam,
  submitLesen,
} from "@/learner/core/api/examApi";
import { startSession } from "@/learner/core/exam/mockExamSession";
import { trackEvent } from "@/learner/core/analytics/posthog";

const inProgress409 = () =>
  new ApiErrorCtor(409, "mock_in_progress", undefined, {
    error: "mock_in_progress",
    mock_attempt_id: "m1",
    status: "in_progress",
  });

const MOCK_ATTEMPT_ROW_FIXTURE = {
  id: "ma-1",
  exam_slug: "telc-b1-mt1",
  status: "in_progress",
  lesen_attempt_id: "la-1",
  hoeren_attempt_id: null,
  schreiben_submission_id: null,
  sprechen_submission_id: null,
  per_competence_report: { lesen: { status: "scored" } },
  started_at: "2026-08-01T00:00:00Z",
  finalized_at: null,
};

describe("mockExam wire client + session service", () => {
  beforeEach(() => {
    __resetLearnerDbForTests();
    invokeFnMock.mockReset();
    rawGetMock.mockReset();
    mockAttemptFrom.mockClear();
    mockAttemptSelect.mockClear();
    mockAttemptEq.mockClear();
    mockAttemptMaybeSingle.mockClear();
    mockAttemptResult = { data: null, error: null };
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

// ---------------------------------------------------------------------------
// getMockAttempt — PostgREST reader (S8 · Task 8.1)
// ---------------------------------------------------------------------------

describe("getMockAttempt", () => {
  beforeEach(() => {
    mockAttemptFrom.mockClear();
    mockAttemptSelect.mockClear();
    mockAttemptEq.mockClear();
    mockAttemptMaybeSingle.mockClear();
    mockAttemptResult = { data: null, error: null };
  });

  it("selects the exact columns from mock_exam_attempts, filters by id, and maps snake_case to camelCase — per_competence_report passes through unparsed", async () => {
    mockAttemptResult = { data: MOCK_ATTEMPT_ROW_FIXTURE, error: null };
    const row = await getMockAttempt("ma-1");

    expect(mockAttemptFrom).toHaveBeenCalledWith("mock_exam_attempts");
    expect(mockAttemptSelect).toHaveBeenCalledWith(
      "id, exam_slug, status, lesen_attempt_id, hoeren_attempt_id, schreiben_submission_id, sprechen_submission_id, per_competence_report, started_at, finalized_at"
    );
    expect(mockAttemptEq).toHaveBeenCalledWith("id", "ma-1");
    expect(row).toEqual({
      id: "ma-1",
      examSlug: "telc-b1-mt1",
      status: "in_progress",
      lesenAttemptId: "la-1",
      hoerenAttemptId: null,
      schreibenSubmissionId: null,
      sprechenSubmissionId: null,
      perCompetenceReport: { lesen: { status: "scored" } },
      startedAt: "2026-08-01T00:00:00Z",
      finalizedAt: null,
    });
  });

  it("returns null when no row matches the id (not an error)", async () => {
    mockAttemptResult = { data: null, error: null };
    const row = await getMockAttempt("missing-id");
    expect(row).toBeNull();
  });

  it("throws mock_attempt_read_failed on a PostgREST query error", async () => {
    mockAttemptResult = { data: null, error: { message: "permission_denied" } };
    await expect(getMockAttempt("ma-1")).rejects.toThrow("mock_attempt_read_failed");
  });
});

// ---------------------------------------------------------------------------
// facade re-exports (examApi) — getMockAttempt + nextModuleForStatus
// (S8 · Task 8.1, Constraint 15)
// ---------------------------------------------------------------------------

describe("facade re-exports (examApi) — getMockAttempt + nextModuleForStatus", () => {
  it("resolves getMockAttempt from the facade — identical reference", () => {
    expect(getMockAttemptFacade).toBe(getMockAttempt);
  });

  it("nextModuleForStatus is exported from examApi and maps all 7 statuses — schreiben_done pins to SPRECHEN", () => {
    expect(nextModuleForStatus("in_progress")).toBe("LESEN");
    expect(nextModuleForStatus("lesen_done")).toBe("HOEREN");
    expect(nextModuleForStatus("hoeren_done")).toBe("SCHREIBEN");
    // Pinned explicitly per the task-8.1 brief: this is the mapping 8.6
    // will consume for the resume-into-Sprechen leg.
    expect(nextModuleForStatus("schreiben_done")).toBe("SPRECHEN");
    expect(nextModuleForStatus("sprechen_done")).toBeNull();
    expect(nextModuleForStatus("finalized")).toBeNull();
    expect(nextModuleForStatus("abandoned")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// posthog event catalogue — compile probe only (S8 · Task 8.1, Constraint 14)
//
// `posthog.ts` is NOT edited by this task — `simulation_started`,
// `simulation_submitted`, and `exam_home_card_tapped` are already typed
// (shipped since S4). There is no failing-first step possible for an
// already-shipped type: the assertion below is that these `trackEvent`
// calls TYPECHECK with mobile's exact payload shapes (verified by
// `npm run typecheck`, not by any runtime behavior), plus one
// `@ts-expect-error` probe proving the payload union is closed (an unknown
// key on a fresh object literal is a compile error, not silently allowed).
// The runtime call itself is a no-op in this test env (no
// NEXT_PUBLIC_POSTHOG_KEY configured) — `trackEvent` degrades to a silent
// no-op by design (see `posthog.ts`'s `ensureClient`).
// ---------------------------------------------------------------------------

describe("posthog event catalogue — compile probe (already typed, no failing-first step)", () => {
  it("simulation_started / simulation_submitted / exam_home_card_tapped typecheck with the exact mobile payload shapes", () => {
    trackEvent("simulation_started", { modelltest_id: "mt-1", board: "telc" });
    trackEvent("simulation_submitted", {
      modelltest_id: "mt-1",
      board: "telc",
      duration_ms: 1200,
    });
    trackEvent("exam_home_card_tapped", { card: "full_simulation" });
    trackEvent("exam_home_card_tapped", { card: "module", module: "LESEN" });
    trackEvent("exam_home_card_tapped", { card: "resume" });

    // @ts-expect-error — "badKey" is not a member of exam_home_card_tapped's
    // properties; proves the AnalyticsEvent union is closed (excess-property
    // checked), not structurally open to arbitrary payload keys.
    trackEvent("exam_home_card_tapped", { card: "module", badKey: "x" });

    expect(trackEvent).toBeInstanceOf(Function);
  });
});
