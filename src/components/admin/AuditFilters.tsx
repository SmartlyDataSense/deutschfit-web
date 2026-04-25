import { Box, Input, Text } from "@/components/primitives";

export type AuditFilterState = {
  actor: string;
  action: string;
  q: string;
  from: string;
  to: string;
};

type Props = {
  pathname: string;
  state: AuditFilterState;
};

const ACTIONS = ["assign", "revoke", "edit", "note_update"];

export function AuditFilters({ pathname, state }: Props) {
  return (
    <form
      method="GET"
      action={pathname}
      className="rounded-lg border border-line-soft bg-bg-card p-4"
    >
      <Box className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="flex flex-col gap-1">
          <Text variant="small" className="text-text-secondary">
            Action
          </Text>
          <select
            name="action"
            defaultValue={state.action}
            className="rounded-md border border-line-strong bg-bg-card px-3 py-2 text-sm text-text-primary"
          >
            <option value="">Any</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <Text variant="small" className="text-text-secondary">
            Actor (email)
          </Text>
          <Input type="search" name="actor" defaultValue={state.actor} placeholder="actor email" />
        </label>
        <label className="flex flex-col gap-1">
          <Text variant="small" className="text-text-secondary">
            Target user (email)
          </Text>
          <Input type="search" name="q" defaultValue={state.q} placeholder="target email" />
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
      <Box className="mt-3 flex items-center gap-3">
        <button
          type="submit"
          className="rounded-md bg-cta px-4 py-2 text-sm font-semibold text-cta-ink"
        >
          Apply filters
        </button>
        <a href={pathname} className="text-sm text-text-tertiary underline underline-offset-2">
          Reset
        </a>
      </Box>
    </form>
  );
}
