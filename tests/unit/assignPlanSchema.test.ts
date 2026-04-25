import { describe, it, expect } from "vitest";
import { AssignPlanInput } from "@/lib/admin/assignPlanSchema";

const userId = "11111111-1111-4111-8111-111111111111";
const planId = "22222222-2222-4222-8222-222222222222";
const validFrom = "2026-04-25T00:00:00Z";
const validUntilLater = "2026-05-25T00:00:00Z";
const validUntilEarlier = "2026-04-24T00:00:00Z";

describe("AssignPlanInput", () => {
  it("requires payment_ref for paid methods (e.g. cash)", () => {
    const result = AssignPlanInput.safeParse({
      user_id: userId,
      plan_id: planId,
      payment_method: "cash",
      valid_from: validFrom,
    });
    expect(result.success).toBe(false);
  });

  it("accepts paid methods when payment_ref is set", () => {
    const result = AssignPlanInput.safeParse({
      user_id: userId,
      plan_id: planId,
      payment_method: "cash",
      payment_ref: "RECEIPT-001",
      valid_from: validFrom,
    });
    expect(result.success).toBe(true);
  });

  it("requires reason when payment_method=comp", () => {
    const result = AssignPlanInput.safeParse({
      user_id: userId,
      plan_id: planId,
      payment_method: "comp",
      valid_from: validFrom,
    });
    expect(result.success).toBe(false);
  });

  it("accepts comp with a reason", () => {
    const result = AssignPlanInput.safeParse({
      user_id: userId,
      plan_id: planId,
      payment_method: "comp",
      reason: "QA tester",
      valid_from: validFrom,
    });
    expect(result.success).toBe(true);
  });

  it("rejects valid_until earlier than or equal to valid_from", () => {
    const result = AssignPlanInput.safeParse({
      user_id: userId,
      plan_id: planId,
      payment_method: "cash",
      payment_ref: "X",
      valid_from: validFrom,
      valid_until: validUntilEarlier,
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid_until strictly after valid_from", () => {
    const result = AssignPlanInput.safeParse({
      user_id: userId,
      plan_id: planId,
      payment_method: "cash",
      payment_ref: "X",
      valid_from: validFrom,
      valid_until: validUntilLater,
    });
    expect(result.success).toBe(true);
  });
});
