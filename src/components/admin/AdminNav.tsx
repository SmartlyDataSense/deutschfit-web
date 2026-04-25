import { Box, Text } from "@/components/primitives";
import { Link } from "@/i18n/navigation";
import { signOutAction } from "./signOutAction";

type Props = {
  operatorEmail: string | null;
};

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/subscriptions", label: "Subscriptions" },
  { href: "/admin/audit", label: "Audit" },
  { href: "/admin/plans", label: "Plans" },
] as const;

/**
 * Top nav for the back-office. English-only by spec — admin is operator-
 * facing and we don't translate its chrome. Sign-out posts to the shared
 * `signOutAction` server action.
 */
export function AdminNav({ operatorEmail }: Props) {
  return (
    <header className="border-b border-line-soft bg-bg-card">
      <Box className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-4">
        <Box className="flex items-center gap-8">
          <Link
            href="/admin"
            className="font-display text-xl font-bold tracking-tight text-text-primary"
          >
            DeutschFit · Admin
          </Link>
          <nav className="hidden items-center gap-5 sm:flex">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-sm font-medium text-text-secondary hover:text-text-primary"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </Box>
        <Box className="flex items-center gap-3">
          {operatorEmail ? (
            <Text variant="small" className="hidden text-text-tertiary sm:block">
              {operatorEmail}
            </Text>
          ) : null}
          <form action={signOutAction}>
            <button
              type="submit"
              className="rounded-md border border-line-strong px-3 py-1.5 text-sm font-medium text-text-primary hover:bg-cream-deep"
            >
              Sign out
            </button>
          </form>
        </Box>
      </Box>
    </header>
  );
}
