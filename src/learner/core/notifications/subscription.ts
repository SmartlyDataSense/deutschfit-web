/**
 * S12 — Push subscription lifecycle for the learner app.
 *
 * Pairs with `deutschfit-backend/supabase/functions/register-web-push`
 * (cross-repo contract: {endpoint, keys:{p256dh,auth}, user_agent?} to
 * register, {endpoint, unsubscribe:true} to soft-expire).
 *
 * Callers gate on getWebPushSupport() === "supported" before calling
 * subscribeToPush; the functions still guard defensively so a race
 * (e.g. extension removing PushManager) surfaces as a rejected promise
 * the hook maps to an error state — never an uncaught crash.
 */
import { invokeFn } from "@/learner/core/api/client";

import { getVapidPublicKey, urlBase64ToUint8Array } from "./webPush";

/** Thrown when the user (or browser policy) denies the permission prompt. */
export class PushPermissionDeniedError extends Error {
  constructor() {
    super("notifications permission denied");
    this.name = "PushPermissionDeniedError";
  }
}

/**
 * Registers `/sw.js` and resolves only once a worker is ACTIVE for this
 * scope. `register()` resolves as soon as the registration exists — the
 * worker may still be installing, and `pushManager.subscribe()` against a
 * registration with no active worker fails with
 * `AbortError: Registration failed - permission denied`, which reads like
 * a permission problem but is not one. That is exactly what happened on a
 * learner's first-ever visit (fresh browser profile, no cached worker) —
 * found in the S12 B7 live pass, invisible to a mocked test.
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  await window.navigator.serviceWorker.register("/sw.js");
  return await window.navigator.serviceWorker.ready;
}

export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (typeof window === "undefined") return null;
  if (!("serviceWorker" in window.navigator)) return null;
  const registration = await window.navigator.serviceWorker.getRegistration("/");
  if (!registration) return null;
  return await registration.pushManager.getSubscription();
}

/**
 * Full opt-in flow: SW registration → permission prompt (if still
 * "default") → pushManager.subscribe → backend registration.
 * If the backend write fails, the fresh local subscription is rolled
 * back before rethrowing — otherwise the browser holds a subscription
 * the backend will never dispatch to.
 */
export async function subscribeToPush(): Promise<void> {
  const vapidKey = getVapidPublicKey();
  if (!vapidKey) throw new Error("web push not configured");

  const registration = await registerServiceWorker();

  if (Notification.permission === "denied") {
    throw new PushPermissionDeniedError();
  }
  if (Notification.permission !== "granted") {
    const outcome = await Notification.requestPermission();
    if (outcome !== "granted") throw new PushPermissionDeniedError();
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey),
  });

  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!json.endpoint || !p256dh || !auth) {
    await subscription.unsubscribe();
    throw new Error("subscription missing keys");
  }

  try {
    await invokeFn<{ ok: true }>("register-web-push", {
      method: "POST",
      body: {
        endpoint: json.endpoint,
        keys: { p256dh, auth },
        user_agent: window.navigator.userAgent,
      },
    });
  } catch (err) {
    // No orphan subscriptions: backend never heard of it → undo locally.
    await subscription.unsubscribe().catch(() => undefined);
    throw err;
  }
}

/**
 * Opt-out flow: local unsubscribe first (the user-visible effect), then
 * best-effort backend soft-expiry. A failed backend call is swallowed —
 * the dead endpoint returns 410 on the next dispatch and the emitter
 * prunes it server-side.
 */
export async function unsubscribeFromPush(): Promise<void> {
  const subscription = await getExistingSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  try {
    await invokeFn<{ ok: true }>("register-web-push", {
      method: "POST",
      body: { endpoint, unsubscribe: true },
    });
  } catch {
    console.warn("register-web-push unsubscribe failed; server row will be 410-pruned");
  }
}
