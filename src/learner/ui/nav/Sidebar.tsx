"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { useTranslation } from "react-i18next";

import { AppText } from "@/learner/ui/primitives";
import { useLearnerSession } from "@/learner/core/auth/useLearnerSession";

import { NavIcon } from "./NavIcon";
import { NAV_TABS, buildTabHref, resolveTabTint, type NavTabId } from "./navModel";

const ICON_SIZE = 22;

export interface SidebarProps {
  readonly locale: string;
  readonly activeTabId: NavTabId | null;
}

/**
 * Persistent left sidebar — the desktop (`lg` breakpoint, 1024px, and up)
 * counterpart to `TabBar`. Mobile has no equivalent chrome (React
 * Navigation's bottom tabs are its only nav surface); this is a web-only
 * addition per the S1 design brief. Sized via the `--nav-sidebar-width`
 * token, which `(protected)/layout.tsx` also reads to offset content.
 *
 * Wordmark links back to Accueil; the 5 tabs share `navModel`'s tint
 * contract with `TabBar` (Coach always teal, others orange only while
 * active); sign-out calls `useLearnerSession().signOut()` then replaces
 * the history entry with `/{locale}/app/login` (matches `LoginForm`'s
 * `router.replace` pattern — no stale authenticated shell reachable via
 * the back button after signing out).
 */
export function Sidebar({ locale, activeTabId }: SidebarProps) {
  const router = useRouter();
  const { t } = useTranslation(["common", "profil"]);
  const signOut = useLearnerSession((state) => state.signOut);

  async function handleSignOut() {
    await signOut();
    router.replace(`/${locale}/app/login`);
  }

  return (
    <aside
      data-testid="learner-sidebar"
      className="fixed inset-y-0 left-0 z-[var(--z-header)] hidden w-[var(--nav-sidebar-width)] flex-col border-r border-line-soft bg-bg-card lg:flex"
    >
      <Link href={`/${locale}/app`} className="px-6 py-6" data-testid="learner-sidebar-wordmark">
        <AppText as="span" size="h3" weight="bold" family="serif">
          DeutschFit
        </AppText>
      </Link>

      <nav className="flex flex-1 flex-col gap-1 px-3">
        {NAV_TABS.map((tab) => {
          const isActive = tab.id === activeTabId;
          const tint = resolveTabTint(tab.id, isActive);

          return (
            <Link
              key={tab.id}
              href={buildTabHref(locale, tab)}
              aria-current={isActive ? "page" : undefined}
              aria-label={t(`common:${tab.a11yKey}`)}
              data-testid={`learner-sidebar-${tab.id}`}
              className={clsx(
                "flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-3 transition-colors hover:bg-bg-subtle",
                tint.pillClass
              )}
            >
              <NavIcon icon={tab.icon} size={ICON_SIZE} color={tint.iconVar} />
              <span className={clsx("text-body font-medium", tint.textClass)}>
                {t(`common:${tab.labelKey}`)}
              </span>
            </Link>
          );
        })}
      </nav>

      <button
        type="button"
        onClick={() => void handleSignOut()}
        aria-label={t("profil:account.signOutA11y")}
        data-testid="learner-sidebar-signout"
        className="mx-3 mb-6 flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-3 text-left transition-colors hover:bg-bg-subtle"
      >
        <AppText as="span" size="body" tone="secondary">
          {t("profil:account.signOut")}
        </AppText>
      </button>
    </aside>
  );
}
