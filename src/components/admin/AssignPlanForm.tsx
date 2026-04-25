"use client";

import { useActionState, useMemo, useState } from "react";
import { Box, Text, Button, Input } from "@/components/primitives";
import { PAYMENT_METHODS } from "@/lib/admin/assignPlanSchema";
import {
  assignPlanAction,
  type AssignPlanResult,
} from "@/app/[locale]/(admin)/admin/users/[userId]/assign/actions";

export type PlanOption = {
  id: string;
  code: string;
  name: string;
  price_xaf: number;
  duration_days: number;
};

type Props = {
  userId: string;
  plans: PlanOption[];
};

const xafFormatter = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "XAF",
  maximumFractionDigits: 0,
});

function defaultValidFrom(): string {
  // <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm" in the local TZ.
  const now = new Date();
  const tzOffsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - tzOffsetMs).toISOString().slice(0, 16);
}

export function AssignPlanForm({ userId, plans }: Props) {
  const [state, formAction, pending] = useActionState<AssignPlanResult | undefined, FormData>(
    assignPlanAction,
    undefined
  );

  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const isComp = paymentMethod === "comp";

  const planOptions = useMemo(() => {
    return plans.map((p) => ({
      ...p,
      label: `${p.name} (${p.code}) — ${xafFormatter.format(p.price_xaf)} / ${p.duration_days}d`,
    }));
  }, [plans]);

  return (
    <Box className="rounded-lg border border-line-soft bg-bg-card p-4">
      <Text variant="h3" as="h3" className="text-text-primary">
        Assign plan
      </Text>
      <Text variant="small" className="mt-1 text-text-tertiary">
        Issues a paid or comp subscription. Sends an activation email to the user when RESEND is
        configured.
      </Text>

      <form action={formAction} className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <input type="hidden" name="user_id" value={userId} />

        <label className="flex flex-col gap-1">
          <Text variant="small" className="text-text-secondary">
            Plan
          </Text>
          <select
            name="plan_id"
            required
            defaultValue=""
            className="rounded-md border border-line-strong bg-bg-card px-3 py-2 text-sm text-text-primary"
          >
            <option value="" disabled>
              Pick a plan…
            </option>
            {planOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <Text variant="small" className="text-text-secondary">
            Payment method
          </Text>
          <select
            name="payment_method"
            required
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            className="rounded-md border border-line-strong bg-bg-card px-3 py-2 text-sm text-text-primary"
          >
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <Text variant="small" className="text-text-secondary">
            Payment reference {isComp ? "(optional for comp)" : "(required)"}
          </Text>
          <Input
            type="text"
            name="payment_ref"
            placeholder="MoMo tx id, bank receipt, etc."
            required={!isComp}
          />
        </label>

        <label className="flex flex-col gap-1">
          <Text variant="small" className="text-text-secondary">
            Reason {isComp ? "(required for comp)" : "(optional)"}
          </Text>
          <Input
            type="text"
            name="reason"
            placeholder="Why this comp / context"
            required={isComp}
          />
        </label>

        <label className="flex flex-col gap-1">
          <Text variant="small" className="text-text-secondary">
            Valid from
          </Text>
          <Input
            type="datetime-local"
            name="valid_from"
            defaultValue={defaultValidFrom()}
            required
          />
        </label>

        <label className="flex flex-col gap-1">
          <Text variant="small" className="text-text-secondary">
            Valid until (optional)
          </Text>
          <Input
            type="datetime-local"
            name="valid_until"
            placeholder="leave blank to use plan duration"
          />
        </label>

        <label className="flex flex-col gap-1 md:col-span-2">
          <Text variant="small" className="text-text-secondary">
            Note (optional, internal)
          </Text>
          <Input type="text" name="note" placeholder="optional internal note" />
        </label>

        <Box className="md:col-span-2 flex items-center justify-between gap-3">
          <Box className="min-h-5">
            {state?.ok === false ? (
              <Text variant="small" className="text-warning-red">
                {state.error}
              </Text>
            ) : null}
            {state?.ok === true ? (
              <Text variant="small" className="text-text-secondary">
                Subscription created.
                {state.emailWarning ? ` ${state.emailWarning}` : ""}
              </Text>
            ) : null}
          </Box>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Assign plan"}
          </Button>
        </Box>
      </form>
    </Box>
  );
}
