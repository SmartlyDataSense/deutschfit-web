/* DeutschFit learner — web push service worker (S12).
 *
 * Payload contract (backend supabase/functions/_shared/web_push_subscriptions.ts):
 *   { "type": "grading_ready" | "coach_reply", "title": string,
 *     "body": string, "url": string }   — url is a web path (/fr/app/...).
 *
 * Defensive by design: a push with a missing, non-JSON, or malformed
 * payload shows generic copy instead of throwing (a throwing push
 * handler can get the subscription dropped by the browser).
 */

self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

var FALLBACK = {
  type: "generic",
  title: "DeutschFit",
  body: "Ouvre l'app pour voir la suite.",
  url: "/fr/app",
};

/* Only ever navigate to a path on our own origin.
 *
 * A leading-slash test alone is not enough: "//evil.com" and "/\evil.com"
 * both start with "/" but browsers resolve them as off-origin absolute
 * URLs, so clients.openWindow() would take the learner off the app. Resolve
 * against our origin and require the result to still be ours. Never throws —
 * a malformed value falls back like any other bad payload field.
 */
function safePath(value) {
  if (typeof value !== "string" || value.charAt(0) !== "/") return FALLBACK.url;
  try {
    var u = new URL(value, self.location.origin);
    if (u.origin !== self.location.origin) return FALLBACK.url;
    return u.pathname + u.search + u.hash;
  } catch (e) {
    return FALLBACK.url;
  }
}

self.addEventListener("push", function (event) {
  var payload = FALLBACK;
  if (event.data) {
    try {
      var parsed = event.data.json();
      if (
        parsed &&
        typeof parsed.title === "string" &&
        typeof parsed.body === "string"
      ) {
        payload = {
          type: typeof parsed.type === "string" ? parsed.type : "generic",
          title: parsed.title,
          body: parsed.body,
          url: safePath(parsed.url),
        };
      }
    } catch (e) {
      // Non-JSON payload — keep the generic fallback copy.
    }
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/brand/icon.png",
      badge: "/brand/monogram-dark.png",
      tag: payload.type,
      data: { url: payload.url },
    })
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  // Re-sanitize at click time too: the push handler already ran safePath,
  // but notification data is the thing we actually navigate to, and it costs
  // nothing to refuse an off-origin value at the point of use.
  var url = safePath(event.notification.data && event.notification.data.url);
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(function (clientList) {
        for (var i = 0; i < clientList.length; i++) {
          var client = clientList[i];
          if (new URL(client.url).origin === self.location.origin) {
            if ("navigate" in client) client.navigate(url);
            if ("focus" in client) return client.focus();
          }
        }
        return self.clients.openWindow(url);
      })
  );
});
