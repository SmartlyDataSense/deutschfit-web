import { Box, Input } from "@/components/primitives";

type Props = {
  query: string;
  pathname: string;
};

/**
 * Server-rendered GET form. The page reads `q` from searchParams and
 * filters via `searchUsers()`. Plain HTML so it works without JS.
 */
export function UserSearchBar({ query, pathname }: Props) {
  return (
    <form method="GET" action={pathname}>
      <Box className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Search by email…"
          className="sm:max-w-md"
        />
        <button
          type="submit"
          className="rounded-md bg-cta px-4 py-2 text-sm font-semibold text-cta-ink"
        >
          Search
        </button>
      </Box>
    </form>
  );
}
