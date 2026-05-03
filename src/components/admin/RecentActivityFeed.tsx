import { Box, Text } from "@/components/primitives";
import type { RecentActivityRow } from "@/lib/admin/kpiQueries";

type Props = {
  rows: RecentActivityRow[];
};

const ACTION_LABEL: Record<string, string> = {
  assign: "Assigned",
  revoke: "Revoked",
  note_update: "Note updated",
  trial_reset: "Trial reset",
};

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace("T", " ").slice(0, 16) + "Z";
}

/**
 * Last-N audit rows on the dashboard. Renders inline without a router-link
 * to a per-row detail (the user-detail page already exposes the same data).
 */
export function RecentActivityFeed({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <Box className="rounded-lg border border-line-soft bg-bg-card p-6">
        <Text variant="body" className="text-text-tertiary">
          No audit activity yet.
        </Text>
      </Box>
    );
  }
  return (
    <Box className="overflow-hidden rounded-lg border border-line-soft bg-bg-card">
      <table className="w-full text-left text-sm">
        <thead className="bg-cream-deep text-xs uppercase tracking-wide text-text-tertiary">
          <tr>
            <th className="px-4 py-3 font-semibold">When (UTC)</th>
            <th className="px-4 py-3 font-semibold">Action</th>
            <th className="px-4 py-3 font-semibold">Target</th>
            <th className="px-4 py-3 font-semibold">Plan</th>
            <th className="px-4 py-3 font-semibold">Operator</th>
            <th className="px-4 py-3 font-semibold">Reason</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-line-soft">
              <td className="px-4 py-3 font-mono text-xs text-text-secondary">
                {formatTimestamp(row.created_at)}
              </td>
              <td className="px-4 py-3 text-text-primary">
                {ACTION_LABEL[row.action] ?? row.action}
              </td>
              <td className="px-4 py-3 text-text-primary">
                {row.target_email ?? row.target_user_id}
              </td>
              <td className="px-4 py-3 text-text-secondary">{row.plan_code ?? "—"}</td>
              <td className="px-4 py-3 text-text-secondary">{row.actor_email ?? row.actor_id}</td>
              <td className="px-4 py-3 text-text-secondary">{row.reason ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Box>
  );
}
