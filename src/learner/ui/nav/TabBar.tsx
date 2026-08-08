"use client";

import Link from "next/link";
import clsx from "clsx";
import { useTranslation } from "react-i18next";

import { NavIcon } from "./NavIcon";
import { NAV_TABS, buildTabHref, resolveTabTint, type NavTabId } from "./navModel";

const ICON_SIZE = 24;

export interface TabBarProps {
  readonly locale: string;
  readonly activeTabId: NavTabId | null;
}

/**
 * Bottom glass tab bar — web port of mobile's `LiquidGlassTabBar`
 * (`deutschfit-mobile/src/app/tabbar/LiquidGlassTabBar.tsx`): frosted
 * surface (`.learner-tabbar-glass`, `globals.css`), 5 tabs, icon above
 * label, active pill per cell. Mobile slides one shared pill between
 * cells (`TabBarPill` + reanimated); this port renders a static pill on
 * the active cell instead — same visual language, no animation
 * dependency.
 *
 * Visible below the `lg` breakpoint (1024px) only; `Sidebar` takes over
 * at `lg` and up — see the responsive contract documented on
 * `LearnerNav`. `fixed` + safe-area-aware bottom padding so it floats
 * over scrollable content on notched devices, matching mobile's
 * `position: "absolute"` bar.
 */
export function TabBar({ locale, activeTabId }: TabBarProps) {
  const { t } = useTranslation("common");

  return (
    <nav
      data-testid="learner-tabbar"
      className="learner-tabbar-glass fixed inset-x-0 bottom-0 z-[var(--z-header)] flex lg:hidden"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), var(--nav-tabbar-safe-min))" }}
    >
      <div className="flex h-[var(--nav-tabbar-height)] w-full items-stretch">
        {NAV_TABS.map((tab) => {
          const isActive = tab.id === activeTabId;
          const tint = resolveTabTint(tab.id, isActive);

          return (
            <Link
              key={tab.id}
              href={buildTabHref(locale, tab)}
              aria-current={isActive ? "page" : undefined}
              aria-label={t(tab.a11yKey)}
              data-testid={`learner-tab-${tab.id}`}
              className={clsx(
                "flex flex-1 flex-col items-center justify-center gap-1 rounded-[var(--radius-md)] mx-1 my-1.5",
                tint.pillClass
              )}
            >
              <NavIcon icon={tab.icon} size={ICON_SIZE} color={tint.iconVar} />
              <span className={clsx("text-caption font-medium", tint.textClass)}>
                {t(tab.labelKey)}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
