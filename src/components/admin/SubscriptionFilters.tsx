import { Box, Input, Text } from "@/components/primitives";
import { PAYMENT_METHODS } from "@/lib/admin/assignPlanSchema";

export type SubscriptionFilterState = {
  status: string;
  payment_method: string;
  plan: string;
  q: string;
  from: string;
  to: string;
};

type Props = {
  pathname: string;
  state: SubscriptionFilterState;
  planCodes: string[];
  csvHref: string;
};

const STATUSES = ["active", "expired", "revoked"];

/**
 * Server-rendered GET form. Submitting it reloads the page with the new
 * searchParams. The `Export CSV` link points at the same query string, so the
 * download mirrors the visible filter set.
 */
export function SubscriptionFilters({ pathname, state, planCodes, csvHref }: Props) {
  return (
    <form
      method="GET"
      action={pathname}
      className="rounded-lg border border-line-soft bg-bg-card p-4"
    >
      <Box className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <label className="flex flex-col gap-1">
          <Text variant="small" className="text-text-secondary">
            Status
          </Text>
          <select
            name="status"
            defaultValue={state.status}
            className="rounded-md border border-line-strong bg-bg-card px-3 py-2 text-sm text-text-primary"
          >
            <option value="">Any</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <Text variant="small" className="text-text-secondary">
            Method
          </Text>
          <select
            name="method"
            defaultValue={state.payment_method}
            className="rounded-md border border-line-strong bg-bg-card px-3 py-2 text-sm text-text-primary"
          >
            <option value="">Any</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <Text variant="small" className="text-text-secondary">
            Plan
          </Text>
          <select
            name="plan"
            defaultValue={state.plan}
            className="rounded-md border border-line-strong bg-bg-card px-3 py-2 text-sm text-text-primary"
          >
            <option value="">Any</option>
            {planCodes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <Text variant="small" className="text-text-secondary">
            Email contains
          </Text>
          <Input type="search" name="q" defaultValue={state.q} placeholder="email substring" />
        </label>
        <label className="flex flex-col gap-1">
          <Text variant="small" className="text-text-secondary">
            From
          </Text>
          <Input type="date" name="from" defaultValue={state.from} />
        </label>
        <label className="flex flex-col gap-1">
          <Text variant="small" className="text-text-secondary">
            To
          </Text>
          <Input type="date" name="to" defaultValue={state.to} />
        </label>
      </Box>
      <Box className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className="rounded-md bg-cta px-4 py-2 text-sm font-semibold text-cta-ink"
        >
          Apply filters
        </button>
        <a
          href={csvHref}
          className="rounded-md border border-line-strong px-4 py-2 text-sm font-medium text-text-primary hover:bg-cream-deep"
        >
          Export CSV
        </a>
        <a href={pathname} className="text-sm text-text-tertiary underline underline-offset-2">
          Reset
        </a>
      </Box>
    </form>
  );
}
