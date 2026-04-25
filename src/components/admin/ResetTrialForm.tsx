"use client";

import { useActionState } from "react";
import { Box, Text, Button, Input } from "@/components/primitives";
import {
  resetTrialAction,
  type ResetTrialResult,
} from "@/app/[locale]/(admin)/admin/users/[userId]/reset-trial/actions";

type Props = {
  userId: string;
};

export function ResetTrialForm({ userId }: Props) {
  const [state, formAction, pending] = useActionState<ResetTrialResult | undefined, FormData>(
    resetTrialAction,
    undefined
  );

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="user_id" value={userId} />
      <Box className="flex flex-col gap-1 sm:flex-row sm:items-center">
        <Input
          type="text"
          name="reason"
          placeholder="Reason (optional, defaults to 'trial reset by operator')"
          className="sm:max-w-md"
        />
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending ? "Resetting…" : "Reset trial usage"}
        </Button>
      </Box>
      {state?.ok === false ? (
        <Text variant="small" className="text-warning-red">
          {state.error}
        </Text>
      ) : null}
      {state?.ok === true ? (
        <Text variant="small" className="text-text-secondary">
          Cleared {state.deletedKinds.length} trial-usage row
          {state.deletedKinds.length === 1 ? "" : "s"}.
        </Text>
      ) : null}
    </form>
  );
}
