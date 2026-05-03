import { z } from "zod";

/**
 * Payment-method enum mirrored from `public.payment_method`. Source of
 * truth for the values is `src/shared/database.types.ts` (regen'd from the
 * backend); duplicating the literal list here keeps Zod happy without
 * importing types into the browser bundle.
 */
export const PAYMENT_METHODS = [
  "cash",
  "momo",
  "orange_money",
  "bank_transfer",
  "wise",
  "paypal",
  "comp",
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * Operator-issued plan assignment payload.
 *
 * Cross-field rules:
 *   - `payment_method !== "comp"` requires `payment_ref` (a transaction id,
 *     phone-number-of-payer, bank receipt number, etc.)
 *   - `payment_method === "comp"` requires `reason` (free-text justification
 *     for the comp; written into `subscription_audit.reason`)
 *   - `valid_until` (when supplied) must be strictly after `valid_from`.
 *     If omitted, the route handler computes it from `plans.duration_days`.
 */
export const AssignPlanInput = z
  .object({
    user_id: z.string().uuid(),
    plan_id: z.string().uuid(),
    payment_method: z.enum(PAYMENT_METHODS),
    payment_ref: z.string().trim().min(1).optional(),
    valid_from: z.string().datetime(),
    valid_until: z.string().datetime().optional(),
    note: z.string().trim().min(1).optional(),
    reason: z.string().trim().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.payment_method !== "comp" && !value.payment_ref) {
      ctx.addIssue({
        code: "custom",
        path: ["payment_ref"],
        message: "payment_ref required for paid methods",
      });
    }
    if (value.payment_method === "comp" && !value.reason) {
      ctx.addIssue({
        code: "custom",
        path: ["reason"],
        message: "reason required when payment_method=comp",
      });
    }
    if (value.valid_until) {
      const from = Date.parse(value.valid_from);
      const until = Date.parse(value.valid_until);
      if (Number.isFinite(from) && Number.isFinite(until) && until <= from) {
        ctx.addIssue({
          code: "custom",
          path: ["valid_until"],
          message: "valid_until must be after valid_from",
        });
      }
    }
  });

export type AssignPlanInputT = z.infer<typeof AssignPlanInput>;
