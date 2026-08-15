/**
 * S12 — web-push capability detection + VAPID applicationServerKey
 * conversion for the learner app.
 *
 * Degradation contract: when the public key is absent, or the browser
 * lacks `serviceWorker` / `PushManager` / `Notification` (iOS Safari
 * outside an installed PWA — S13 triages that), the feature reports
 * "unsupported". Callers render a visible, non-interactive state —
 * never a crash, never a thrown error.
 */

/**
 * NEXT_PUBLIC_* vars are inlined by textual replacement of the dotted
 * form — computed access silently yields undefined in production
 * bundles (see src/learner/core/api/client.ts:45-55). Keep the literal
 * dot access.
 */
export function getVapidPublicKey(): string | null {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  return key && key.length > 0 ? key : null;
}

export type WebPushSupport = "supported" | "unsupported";

export function getWebPushSupport(): WebPushSupport {
  if (!getVapidPublicKey()) return "unsupported";
  if (typeof window === "undefined") return "unsupported";
  if (!("serviceWorker" in window.navigator)) return "unsupported";
  if (!("PushManager" in window)) return "unsupported";
  if (!("Notification" in window)) return "unsupported";
  return "supported";
}

/**
 * base64url → Uint8Array for `pushManager.subscribe`'s
 * `applicationServerKey`. Padding must round the length UP to a
 * multiple of 4 ( `(4 - len % 4) % 4` — the trailing `% 4` prevents
 * adding 4 pad chars when the length is already a multiple of 4,
 * which browsers reject at runtime).
 *
 * Returns `Uint8Array<ArrayBuffer>`, not the default
 * `Uint8Array<ArrayBufferLike>`: `PushSubscriptionOptionsInit.
 * applicationServerKey` is typed as `BufferSource`, which excludes
 * SharedArrayBuffer-backed views. The narrower annotation is what lets
 * the result be passed straight to `pushManager.subscribe`.
 */
export function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
