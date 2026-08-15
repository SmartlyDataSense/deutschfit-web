"use client";

/**
 * S12 — settings-screen state machine for the web-push toggle.
 *
 * States:
 *   unsupported — no key or missing browser APIs (iOS Safari outside an
 *                 installed PWA). Rendered visible + non-interactive.
 *   denied      — Notification.permission === "denied". Distinct from
 *                 "off" on purpose: browsers NEVER re-prompt after a
 *                 denial, so a flippable toggle would silently no-op.
 *                 The screen renders a "blocked in your browser" row.
 *   off / on    — no active subscription / active subscription.
 *   busy        — an enable/disable transition is in flight.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import {
  getExistingSubscription,
  PushPermissionDeniedError,
  subscribeToPush,
  unsubscribeFromPush,
} from "./subscription";
import { getWebPushSupport } from "./webPush";

export type WebPushToggleState = "unsupported" | "denied" | "off" | "on" | "busy";

export interface WebPushSettings {
  state: WebPushToggleState;
  hasError: boolean;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
}

export function useWebPushSettings(): WebPushSettings {
  const [state, setState] = useState<WebPushToggleState>("unsupported");
  const [hasError, setHasError] = useState(false);
  // StrictMode double-mount guard (idiom pinned in web#38): never call
  // setState after unmount from the async hydration below.
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    const hydrate = async () => {
      if (getWebPushSupport() !== "supported") {
        if (isMountedRef.current) setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (isMountedRef.current) setState("denied");
        return;
      }
      try {
        const existing = await getExistingSubscription();
        if (isMountedRef.current) setState(existing ? "on" : "off");
      } catch {
        if (isMountedRef.current) setState("off");
      }
    };
    void hydrate();
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const enable = useCallback(async () => {
    if (getWebPushSupport() !== "supported") return; // safe no-op
    setHasError(false);
    setState("busy");
    try {
      await subscribeToPush();
      if (isMountedRef.current) setState("on");
    } catch (err) {
      if (!isMountedRef.current) return;
      if (err instanceof PushPermissionDeniedError) {
        setState("denied"); // user said no — not an error condition
      } else {
        setState("off");
        setHasError(true);
      }
    }
  }, []);

  const disable = useCallback(async () => {
    setHasError(false);
    setState("busy");
    try {
      await unsubscribeFromPush();
    } catch {
      // Local unsubscribe failing is vanishingly rare; treat as off —
      // the server row 410-prunes on the next dispatch either way.
    }
    if (isMountedRef.current) setState("off");
  }, []);

  return { state, hasError, enable, disable };
}
