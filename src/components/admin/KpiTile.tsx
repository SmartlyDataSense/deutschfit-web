import { Box, Text } from "@/components/primitives";

type Props = {
  label: string;
  value: string;
  hint?: string;
};

/**
 * Single KPI card. Token-driven; numeric value uses the display variant so
 * it dominates the row. Caller passes pre-formatted strings — formatting
 * (XAF locale, percentage, etc.) lives in the page that fans out the
 * queries.
 */
export function KpiTile({ label, value, hint }: Props) {
  return (
    <Box className="rounded-lg border border-line-soft bg-bg-card p-6 shadow-sm">
      <Text variant="caption" className="uppercase tracking-wide text-text-tertiary">
        {label}
      </Text>
      <Text variant="display" as="p" className="mt-2 text-text-primary">
        {value}
      </Text>
      {hint ? (
        <Text variant="small" className="mt-1 text-text-secondary">
          {hint}
        </Text>
      ) : null}
    </Box>
  );
}
