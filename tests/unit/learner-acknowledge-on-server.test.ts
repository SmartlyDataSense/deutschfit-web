import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeFn = vi.fn();
vi.mock("@/learner/core/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/core/api/client")>();
  return { ...actual, invokeFn: (...a: unknown[]) => invokeFn(...a) };
});

import { ApiError } from "@/learner/core/api/client";
import { acknowledgeOnServer } from "@/learner/core/submissions/acknowledgeOnServer";

describe("acknowledgeOnServer", () => {
  beforeEach(() => invokeFn.mockReset());

  it("POSTs { submission_id, module } and resolves on 200", async () => {
    invokeFn.mockResolvedValue({ submission_id: "s1", acknowledged_at: "now" });
    await expect(
      acknowledgeOnServer({ submissionId: "s1", module: "sprechen" })
    ).resolves.toBeUndefined();
    expect(invokeFn).toHaveBeenCalledWith("submissions-acknowledge", {
      method: "POST",
      body: { submission_id: "s1", module: "sprechen" },
    });
  });

  it("treats 404 as idempotent success, rethrows other errors", async () => {
    invokeFn.mockRejectedValueOnce(new ApiError(404, "not_found"));
    await expect(
      acknowledgeOnServer({ submissionId: "s1", module: "schreiben" })
    ).resolves.toBeUndefined();
    invokeFn.mockRejectedValueOnce(new ApiError(500, "db_error"));
    await expect(acknowledgeOnServer({ submissionId: "s1", module: "schreiben" })).rejects.toThrow(
      "db_error"
    );
  });
});
