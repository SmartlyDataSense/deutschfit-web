"use client";

import { usePathname } from "next/navigation";
import { useLocale } from "next-intl";

import { Sidebar } from "./Sidebar";
import { TabBar } from "./TabBar";
import { resolveActiveTabId } from "./navModel";

/**
 * Responsive nav shell — mounts both `TabBar` and `Sidebar` unconditionally
 * and lets CSS (not JS/`matchMedia`) decide which renders:
 *
 *   - `<768px` (phone) and the `768–1023px` gap the design brief leaves
 *     silent on default to the mobile pattern → `TabBar` (`flex lg:hidden`).
 *   - `≥1024px` (`lg` and up) → `Sidebar` (`hidden lg:flex`).
 *
 * CSS-only switching (both surfaces always mount; Tailwind toggles
 * `display`) avoids the hydration flash a `matchMedia` hook would cause —
 * SSR has no viewport to read, so a JS-driven switch would render the
 * wrong surface (or neither) until the first client effect runs.
 *
 * Active-tab resolution (`resolveActiveTabId`) is locale-aware and
 * nested-route-aware — see `navModel.ts`.
 *
 * Mounted inside `LearnerGuard` (see `(protected)/layout.tsx`), so only
 * authenticated learners ever see navigation chrome.
 */
export function LearnerNav() {
  const pathname = usePathname();
  const locale = useLocale();
  const activeTabId = resolveActiveTabId(pathname, locale);

  return (
    <>
      <Sidebar locale={locale} activeTabId={activeTabId} />
      <TabBar locale={locale} activeTabId={activeTabId} />
    </>
  );
}
