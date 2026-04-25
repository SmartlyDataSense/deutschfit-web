import { Box, Text } from "@/components/primitives";

type Props = {
  page: number;
  pageSize: number;
  total: number;
  buildHref: (page: number) => string;
};

/**
 * Token-driven pagination strip. Renders prev/next anchors only when there
 * are pages to navigate to. The caller passes a `buildHref(page)` so this
 * stays oblivious to the exact searchParams shape of the host page.
 */
export function Pagination({ page, pageSize, total, buildHref }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;
  if (totalPages <= 1) {
    return (
      <Box className="mt-4 flex items-center">
        <Text variant="small" className="text-text-tertiary">
          {total} {total === 1 ? "row" : "rows"}
        </Text>
      </Box>
    );
  }
  return (
    <Box className="mt-4 flex items-center justify-between">
      <Text variant="small" className="text-text-tertiary">
        Page {page} of {totalPages} · {total} {total === 1 ? "row" : "rows"}
      </Text>
      <Box className="flex items-center gap-2">
        {hasPrev ? (
          <a
            href={buildHref(page - 1)}
            className="rounded-md border border-line-strong px-3 py-1.5 text-sm font-medium text-text-primary hover:bg-cream-deep"
          >
            ← Prev
          </a>
        ) : null}
        {hasNext ? (
          <a
            href={buildHref(page + 1)}
            className="rounded-md border border-line-strong px-3 py-1.5 text-sm font-medium text-text-primary hover:bg-cream-deep"
          >
            Next →
          </a>
        ) : null}
      </Box>
    </Box>
  );
}
