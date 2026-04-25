"use client";

import { useActionState } from "react";
import { Box, Text, Button, Input } from "@/components/primitives";
import {
  revokeSubscriptionAction,
  type RevokeResult,
} from "@/app/[locale]/(admin)/admin/users/[userId]/revoke/actions";

type Props = {
  userId: string;
  subscriptionId: string;
  label: string;
};

export function RevokeForm({ userId, subscriptionId, label }: Props) {
  const [state, formAction, pending] = useActionState<RevokeResult | undefined, FormData>(
    revokeSubscriptionAction,
    undefined
  );

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="user_id" value={userId} />
      <input type="hidden" name="subscription_id" value={subscriptionId} />
      <Box className="flex flex-col gap-1 sm:flex-row sm:items-center">
        <Input
          type="text"
          name="reason"
          required
          placeholder={`Reason for revoking ${label}`}
          className="sm:max-w-md"
        />
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending ? "Revoking…" : "Revoke"}
        </Button>
      </Box>
      {state?.ok === false ? (
        <Text variant="small" className="text-warning-red">
          {state.error}
        </Text>
      ) : null}
    </form>
  );
}
