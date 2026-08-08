"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { AppText } from "@/learner/ui/primitives";

/**
 * `useOnlineStatus` — live online/offline status for the browser tab.
 *
 * Ports the *contract* of mobile's `useNetworkStatus` (`isOffline` boolean
 * the banner consumes) to the web platform primitive: `navigator.onLine` +
 * `window`'s `online`/`offline` events, instead of `@react-native-community/netinfo`
 * (no such native module on web). `navigator.onLine` only reflects link-layer
 * connectivity (true even on a captive portal with no real internet) — same
 * caveat mobile's `NetInfoState.isConnected` has; good enough for "should we
 * warn the learner their next network call might fail."
 *
 * Reads the initial value lazily in `useState` (not `useEffect`) so the
 * first render already reflects reality instead of defaulting to "online"
 * for one tick — SSR-safe via the `typeof navigator === "undefined"` guard
 * (server has no `navigator`; `navigator.onLine` isn't part of the initial
 * HTML anyway, so this never causes a hydration mismatch in practice).
 */
export function useOnlineStatus(): boolean {
  const [isOffline, setIsOffline] = useState(() =>
    typeof navigator === "undefined" ? false : !navigator.onLine
  );

  useEffect(() => {
    function handleOnline() {
      setIsOffline(false);
    }
    function handleOffline() {
      setIsOffline(true);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    // Re-sync on mount in case connectivity changed between the lazy
    // `useState` initializer (evaluated at module/component construction)
    // and this effect running (e.g. React StrictMode's double-invoke, or a
    // slow hydration window).
    setIsOffline(!navigator.onLine);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return isOffline;
}

/**
 * `OfflineBanner` — app-wide offline indicator. Ports
 * `deutschfit-mobile/src/ui/blocks/OfflineBanner.tsx`: renders nothing while
 * online; a `warningRed` pill overlays the top of the viewport when the
 * browser drops offline.
 *
 * `fixed` (not `sticky`/in-flow) so it never shifts layout when it
 * appears/disappears — it overlays whatever is already rendered, same as
 * mobile's `position: "absolute"` bar. Sits above `TabBar`/`Sidebar`
 * (`--z-header`) via `--z-banner`.
 *
 * Mounted once from `LearnerProviders`, above both `/app/login` and the
 * `(protected)` segment, so the warning is visible regardless of auth
 * state — a learner losing connectivity mid-login should see it too.
 *
 * Accessibility: `role="alert"` + `aria-live="polite"` so screen readers
 * announce the online → offline transition once, when it mounts (mirrors
 * mobile's `accessibilityRole="alert"` + `accessibilityLiveRegion="polite"`).
 */
export function OfflineBanner() {
  const { t } = useTranslation("common");
  const isOffline = useOnlineStatus();

  if (!isOffline) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      data-testid="learner-offline-banner"
      className="fixed inset-x-0 top-0 z-[var(--z-banner)] flex justify-center bg-warning-red px-4 py-2"
    >
      <AppText as="span" tone="inverse" size="small" weight="semi" align="center">
        {t("common:offline.banner")}
      </AppText>
    </div>
  );
}
