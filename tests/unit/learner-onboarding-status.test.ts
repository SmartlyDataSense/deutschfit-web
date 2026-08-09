import { beforeEach, describe, expect, it, vi } from "vitest";

const maybeSingle = vi.fn();
const limit = vi.fn(() => ({ maybeSingle }));
const order = vi.fn(() => ({ limit }));
const eq = vi.fn(() => ({ maybeSingle, order }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));
vi.mock("@/lib/supabase/browser", () => ({ getBrowserClient: () => ({ from }) }));

import { hasDiagnosticOnServer, readOnboardedAt } from "@/learner/core/onboarding/onboardingStatus";

describe("onboardingStatus server primitives", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("readOnboardedAt returns the stamp, null for missing row / empty value, throws on error", async () => {
    maybeSingle.mockResolvedValueOnce({ data: { onboarded_at: "2026-05-22T10:00:00Z" }, error: null });
    await expect(readOnboardedAt("u1")).resolves.toBe("2026-05-22T10:00:00Z");
    expect(from).toHaveBeenCalledWith("user_profiles");

    maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(readOnboardedAt("u1")).resolves.toBe(null);

    maybeSingle.mockResolvedValueOnce({ data: { onboarded_at: "" }, error: null });
    await expect(readOnboardedAt("u1")).resolves.toBe(null);

    maybeSingle.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    await expect(readOnboardedAt("u1")).rejects.toThrow("boom");
  });

  it("hasDiagnosticOnServer orders by created_at desc + limit 1 (multi-row users, issue #297)", async () => {
    maybeSingle.mockResolvedValueOnce({ data: { user_id: "u1" }, error: null });
    await expect(hasDiagnosticOnServer("u1")).resolves.toBe(true);
    expect(from).toHaveBeenCalledWith("user_diagnostic_answers");
    expect(order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(limit).toHaveBeenCalledWith(1);

    maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(hasDiagnosticOnServer("u1")).resolves.toBe(false);

    maybeSingle.mockResolvedValueOnce({ data: null, error: { message: "lookup_failed" } });
    await expect(hasDiagnosticOnServer("u1")).rejects.toThrow("lookup_failed");
  });
});
