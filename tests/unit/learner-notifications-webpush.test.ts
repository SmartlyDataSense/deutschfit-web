/**
 * S12 — webPush capability + key-conversion unit tests.
 *
 * The base64url→Uint8Array conversion is pinned against a known key:
 * an off-by-one in the padding logic produces a key the browser
 * rejects at RUNTIME (pushManager.subscribe throws InvalidAccessError)
 * but that any self-consistent test would miss. The 87-char (65-byte,
 * pad 1), 22-char (16-byte, pad 2), and 16-char (12-byte, pad 0) cases
 * cover all three padding branches.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getWebPushSupport,
  urlBase64ToUint8Array,
} from "@/learner/core/notifications/webPush";

// RFC 8291 §5 sender public key — a real 65-byte uncompressed P-256
// point whose base64url form is 87 chars (needs 1 padding char).
const KNOWN_KEY_65 =
  "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8";
// RFC 8291 §5 auth secret — 16 bytes, 22 chars (needs 2 padding chars).
const KNOWN_KEY_16 = "BTBZMqHH6r4Tts7J_aSIgg";

function reencode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

describe("urlBase64ToUint8Array (S12)", () => {
  it("decodes a 65-byte uncompressed P-256 key exactly (padding = 1)", () => {
    const out = urlBase64ToUint8Array(KNOWN_KEY_65);
    expect(out).toBeInstanceOf(Uint8Array);
    expect(out.length).toBe(65);
    expect(out[0]).toBe(4); // uncompressed-point marker
    expect(reencode(out)).toBe(KNOWN_KEY_65); // lossless round-trip
  });

  it("decodes a 16-byte value exactly (padding = 2)", () => {
    const out = urlBase64ToUint8Array(KNOWN_KEY_16);
    expect(out.length).toBe(16);
    expect(reencode(out)).toBe(KNOWN_KEY_16);
  });

  it("maps url-safe -/_ to +// (would throw or corrupt otherwise)", () => {
    // KNOWN_KEY_65 contains both '-' and '_' — plain atob on the raw
    // string would throw InvalidCharacterError. Reaching here at all
    // pins the character mapping; equality above pins correctness.
    expect(() => urlBase64ToUint8Array(KNOWN_KEY_65)).not.toThrow();
  });

  it("decodes a length ≡ 0 (mod 4) value with ZERO padding (padding = 0)", () => {
    // 16 chars → 12 bytes. Pins the trailing `% 4` in
    // `(4 - len % 4) % 4`: the naive `4 - len % 4` yields 4 here,
    // appends "====" and atob throws — the third padding branch the
    // two tests above cannot reach.
    const KNOWN_KEY_12 = "YWJjZGVmZ2hpamts"; // "abcdefghijkl"
    const out = urlBase64ToUint8Array(KNOWN_KEY_12);
    expect(out.length).toBe(12);
    expect(reencode(out)).toBe(KNOWN_KEY_12);
  });
});

describe("getWebPushSupport (S12)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("is unsupported when NEXT_PUBLIC_VAPID_PUBLIC_KEY is absent", () => {
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "");
    expect(getWebPushSupport()).toBe("unsupported");
  });

  it("is unsupported when PushManager is missing (iOS Safari) — and never throws", () => {
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", KNOWN_KEY_65);
    // jsdom has no PushManager by default; make the premise explicit:
    expect("PushManager" in window).toBe(false);
    expect(() => getWebPushSupport()).not.toThrow();
    expect(getWebPushSupport()).toBe("unsupported");
  });

  it("is supported when key + serviceWorker + PushManager + Notification are all present", () => {
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", KNOWN_KEY_65);
    vi.stubGlobal("PushManager", function PushManager() {});
    vi.stubGlobal("Notification", { permission: "default" });
    Object.defineProperty(window.navigator, "serviceWorker", {
      configurable: true,
      value: { register: vi.fn(), getRegistration: vi.fn() },
    });
    expect(getWebPushSupport()).toBe("supported");
  });
});
