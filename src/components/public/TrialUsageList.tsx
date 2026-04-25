import { getTranslations } from "next-intl/server";
import { Box, Card, Text } from "@/components/primitives";
import type { Database } from "@/shared/database.types";

type TrialKind = Database["public"]["Enums"]["trial_kind"];

type Row = { kind: TrialKind; count: number };

type Props = { rows: Row[] };

/**
 * Read-only "free-tier usage so far" panel. Aggregates by kind so the
 * user sees one row per trial type (Schreiben grading, Sprechen grading,
 * Lesen set, Hören set, coach message, mock exam).
 */
export async function TrialUsageList({ rows }: Props) {
  const t = await getTranslations("account");

  // Aggregate counts per kind in case the row set has duplicates.
  const byKind = new Map<TrialKind, number>();
  for (const row of rows) {
    byKind.set(row.kind, (byKind.get(row.kind) ?? 0) + row.count);
  }

  const ordered = (
    [
      "schreiben_grade",
      "sprechen_grade",
      "lesen_set",
      "hoeren_set",
      "coach_message",
      "mock_exam",
    ] as const
  ).map((kind) => ({ kind, count: byKind.get(kind) ?? 0 }));

  const hasAny = ordered.some((r) => r.count > 0);

  return (
    <Card className="mt-6">
      <Text variant="h3" as="h2" className="text-text-primary">
        {t("trialUsageHeading")}
      </Text>
      {hasAny ? (
        <ul className="mt-3 grid gap-2">
          {ordered.map((r) => (
            <li key={r.kind} className="flex items-center justify-between gap-3">
              <Text variant="body" className="text-text-secondary">
                {t(`trialKind.${r.kind}`)}
              </Text>
              <Text variant="small" className="font-mono text-text-primary">
                {r.count}
              </Text>
            </li>
          ))}
        </ul>
      ) : (
        <Box className="mt-3">
          <Text variant="body" className="text-text-secondary">
            {t("trialUsageEmpty")}
          </Text>
        </Box>
      )}
    </Card>
  );
}
