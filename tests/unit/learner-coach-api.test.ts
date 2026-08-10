import { beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "@/learner/core/api";
import {
  sendCoachMessage,
  listCoachThreads,
  loadCoachThreadHistory,
  codeForStatus,
  codeForBodyError,
} from "@/learner/coach/api";
import {
  getCoachPlan,
  firstSentence,
  deriveConnectors,
  deriveObservation,
} from "@/learner/coach/planApi";
import type { CoachMessage } from "@/learner/coach/types";

const invokeFn = vi.hoisted(() => vi.fn());
vi.mock("@/learner/core/api", async (orig) => {
  const actual = await orig<typeof import("@/learner/core/api")>();
  return { ...actual, invokeFn };
});

const msg = (over: Partial<CoachMessage>): CoachMessage => ({
  id: "m1",
  role: "user",
  text: "hallo",
  createdAt: "2026-08-10T00:00:00Z",
  status: "complete",
  ...over,
});
const req = { threadId: "t1", message: "Wie geht's?", userId: "u1", history: [] as CoachMessage[] };

beforeEach(() => {
  // Block body deliberately, NOT `() => invokeFn.mockReset()`: Vitest treats a
  // function *returned* from beforeEach as an implicit post-test cleanup
  // callback (same convention as `onTestFinished`), and `mockReset()` returns
  // the mock itself — an expression-bodied arrow here would hand that mock
  // back to Vitest, which would then invoke `invokeFn()` a second time after
  // each test with whatever rejecting config the test left behind, producing
  // a spurious unhandled-rejection failure unrelated to the assertions below.
  invokeFn.mockReset();
});

describe("sendCoachMessage", () => {
  test("empty message throws coach_empty_request without a network call", async () => {
    await expect(sendCoachMessage({ ...req, message: "  " })).rejects.toThrow(
      "coach_empty_request"
    );
    await expect(sendCoachMessage({ ...req, threadId: " " })).rejects.toThrow(
      "coach_empty_request"
    );
    expect(invokeFn).not.toHaveBeenCalled();
  });
  test("happy path posts trimmed body and maps snake_case", async () => {
    invokeFn.mockResolvedValue({
      message_id: "srv-1",
      text: "Gut!",
      created_at: "2026-08-10T01:00:00Z",
    });
    const res = await sendCoachMessage({ ...req, message: " Wie geht's? " });
    expect(invokeFn).toHaveBeenCalledWith("ai-coach", {
      method: "POST",
      body: { thread_id: "t1", message: "Wie geht's?", history: [] },
    });
    expect(res).toEqual({ messageId: "srv-1", text: "Gut!", createdAt: "2026-08-10T01:00:00Z" });
  });
  test("history keeps user/assistant turns with non-empty text, last 20", async () => {
    invokeFn.mockResolvedValue({ message_id: "x", text: "y", created_at: "z" });
    const history: CoachMessage[] = [
      msg({ id: "sys", role: "system", text: "sys" }),
      msg({ id: "empty", text: "" }),
      msg({ id: "err", status: "error", text: "failed send" }), // error-status turns ARE sent — mobile has no status filter
      ...Array.from({ length: 25 }, (_, i) => msg({ id: `h${i}`, text: `turn ${i}` })),
    ];
    await sendCoachMessage({ ...req, history });
    const sent = invokeFn.mock.calls[0]![1].body.history as { role: string; text: string }[];
    expect(sent).toHaveLength(20);
    expect(sent[0]!.text).toBe("turn 5");
    expect(sent.every((t) => t.role === "user" || t.role === "assistant")).toBe(true);
  });
  test("429 ApiError maps to coach_rate_limited", async () => {
    invokeFn.mockRejectedValue(new ApiError(429, "rate_limited"));
    await expect(sendCoachMessage(req)).rejects.toThrow("coach_rate_limited");
  });
  test("400 profile_missing_level_or_board maps to coach_profile_incomplete", async () => {
    invokeFn.mockRejectedValue(new ApiError(400, "profile_missing_level_or_board"));
    await expect(sendCoachMessage(req)).rejects.toThrow("coach_profile_incomplete");
  });
  test("502/504 map to coach_service_unavailable; plain 500 to coach_server_error", async () => {
    invokeFn.mockRejectedValue(new ApiError(502, "ai_service_unreachable"));
    await expect(sendCoachMessage(req)).rejects.toThrow("coach_service_unavailable");
    invokeFn.mockRejectedValue(new ApiError(500, "boom"));
    await expect(sendCoachMessage(req)).rejects.toThrow("coach_server_error");
  });
  test("401 with non-code body maps to coach_unauthorized via status fallback", async () => {
    // Real backend 401 bodies are prose strings from _shared/auth.ts, not snake_case codes.
    invokeFn.mockRejectedValue(new ApiError(401, "invalid or expired token"));
    await expect(sendCoachMessage(req)).rejects.toThrow("coach_unauthorized");
  });
  test("non-ApiError rejection maps to coach_transport_failed", async () => {
    invokeFn.mockRejectedValue(new TypeError("fetch failed"));
    await expect(sendCoachMessage(req)).rejects.toThrow("coach_transport_failed");
  });
  test("2xx body carrying error string maps through codeForBodyError", async () => {
    invokeFn.mockResolvedValue({ error: "rate_limited" });
    await expect(sendCoachMessage(req)).rejects.toThrow("coach_rate_limited");
  });
  test("2xx without message_id/text is coach_malformed_response; nullish body coach_empty_response", async () => {
    invokeFn.mockResolvedValue({ text: "only text" });
    await expect(sendCoachMessage(req)).rejects.toThrow("coach_malformed_response");
    invokeFn.mockResolvedValue(null);
    await expect(sendCoachMessage(req)).rejects.toThrow("coach_empty_response");
  });
});

describe("code mappers", () => {
  test("codeForStatus table", () => {
    expect(codeForStatus(401)).toBe("coach_unauthorized");
    expect(codeForStatus(403)).toBe("coach_forbidden");
    expect(codeForStatus(429)).toBe("coach_rate_limited");
    expect(codeForStatus(502)).toBe("coach_service_unavailable");
    expect(codeForStatus(503)).toBe("coach_service_unavailable");
    expect(codeForStatus(504)).toBe("coach_service_unavailable");
    expect(codeForStatus(500)).toBe("coach_server_error");
    expect(codeForStatus(418)).toBe("coach_transport_failed");
  });
  test("codeForBodyError falls back to status then transport", () => {
    expect(codeForBodyError("missing_message", 400)).toBe("coach_transport_failed");
    expect(codeForBodyError("whatever", 429)).toBe("coach_rate_limited");
    expect(codeForBodyError("whatever", null)).toBe("coach_transport_failed");
  });
});

describe("threads + history", () => {
  test("listCoachThreads maps and filters", async () => {
    invokeFn.mockResolvedValue({
      threads: [
        { thread_id: "a", preview: "p", message_count: 3, started_at: "s", last_message_at: "l" },
        {
          thread_id: "",
          preview: "drop me",
          message_count: 1,
          started_at: "s",
          last_message_at: "l",
        },
      ],
    });
    const out = await listCoachThreads();
    expect(out).toEqual([
      { threadId: "a", preview: "p", messageCount: 3, startedAt: "s", lastMessageAt: "l" },
    ]);
  });
  test("listCoachThreads transport error throws coach_threads_fetch_failed; non-array yields []", async () => {
    invokeFn.mockRejectedValue(new ApiError(500, "fetch_failed"));
    await expect(listCoachThreads()).rejects.toThrow("coach_threads_fetch_failed");
    invokeFn.mockResolvedValue({});
    await expect(listCoachThreads()).resolves.toEqual([]);
  });
  test("loadCoachThreadHistory: blank id → [], rows map with status complete, empty text filtered", async () => {
    await expect(loadCoachThreadHistory(" ")).resolves.toEqual([]);
    invokeFn.mockResolvedValue({
      messages: [
        { id: "1", role: "user", text: "hi", created_at: "c" },
        { id: "2", role: "weird", text: "assistant-coerced", created_at: "c" },
        { id: "3", role: "assistant", text: "", created_at: "c" },
      ],
    });
    const out = await loadCoachThreadHistory("t");
    expect(out).toHaveLength(2);
    expect(out[1]!.role).toBe("assistant");
    expect(out.every((m) => m.status === "complete")).toBe(true);
  });
});

describe("planApi", () => {
  test("getCoachPlan maps wire envelope and drops non-connector drills", async () => {
    invokeFn.mockResolvedValue({
      plan_markdown: "# Titre\nPremière phrase. Deuxième.",
      grammar_concept_deep_links: [{ concept_slug: "konnektoren-trotzdem" }],
      model_version: null,
      prompt_version: "v0.2.0",
      generated_at: "g",
      replay: false,
      drills: [
        {
          id: "d1",
          kind: "connector",
          before: "b",
          after: "a",
          answer: "trotzdem",
          distractors: ["deshalb", "obwohl"],
          explanation: "e",
        },
        {
          id: "d2",
          kind: "other",
          before: "b",
          after: "a",
          answer: "x",
          distractors: ["y"],
          explanation: "e",
        },
        {
          id: "",
          kind: "connector",
          before: "b",
          after: "a",
          answer: "x",
          distractors: ["y"],
          explanation: "e",
        },
      ],
    });
    const plan = await getCoachPlan();
    expect(plan.drills.map((d) => d.id)).toEqual(["d1"]);
    expect(plan.planMarkdown).toContain("Première phrase.");
  });
  test("getCoachPlan surfaces body error", async () => {
    invokeFn.mockResolvedValue({ error: "aggregation_failed" });
    await expect(getCoachPlan()).rejects.toThrow("aggregation_failed");
  });
  test("firstSentence skips headings and fences", () => {
    expect(firstSentence("# H\n```\ncode\n```\n- Point un. Suite")).toBe("Point un.");
  });
  test("deriveConnectors matches deep links, falls back to defaults", () => {
    expect(deriveConnectors([{ concept_slug: "x-obwohl-y" }])).toEqual(["obwohl"]);
    expect(deriveConnectors([])).toEqual(["außerdem", "trotzdem", "deshalb", "obwohl"]);
  });
  test("deriveObservation hasSignal", () => {
    const p = {
      planMarkdown: "",
      grammarDeepLinks: [],
      modelVersion: null,
      promptVersion: "v",
      generatedAt: "g",
      replay: false,
      drills: [],
    };
    expect(deriveObservation(p).hasSignal).toBe(false);
  });
});
