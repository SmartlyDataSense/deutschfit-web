/**
 * `next.config.ts` headers() — S12 · Task B1.
 *
 * The `/sw.js` entry was ADDED to an array that already carried the
 * `/.well-known/:file*` rule for Universal Links / App Links association
 * files. The failure mode worth a test is not "does /sw.js have headers"
 * (that's the config restating itself) — it's someone later replacing the
 * array instead of extending it and silently breaking deep links on both
 * mobile platforms. That regression is what this pins.
 */
import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config";

type HeaderRule = {
  source: string;
  headers: Array<{ key: string; value: string }>;
};

async function rules(): Promise<HeaderRule[]> {
  const headers = nextConfig.headers;
  if (typeof headers !== "function") {
    throw new Error("next.config.ts no longer defines headers()");
  }
  return (await headers()) as HeaderRule[];
}

describe("next.config.ts headers()", () => {
  it("still serves the .well-known association files as JSON", async () => {
    const wellKnown = (await rules()).find(
      (r) => r.source === "/.well-known/:file*",
    );
    expect(wellKnown, "the App Links / Universal Links rule was dropped")
      .toBeDefined();
    expect(wellKnown!.headers).toContainEqual({
      key: "Content-Type",
      value: "application/json",
    });
  });

  it("serves /sw.js uncached and scoped to the root", async () => {
    const sw = (await rules()).find((r) => r.source === "/sw.js");
    expect(sw).toBeDefined();
    // A cached service worker pins stale push-handling logic for up to 24h.
    expect(sw!.headers.find((h) => h.key === "Cache-Control")?.value).toContain(
      "no-store",
    );
    expect(sw!.headers).toContainEqual({
      key: "Service-Worker-Allowed",
      value: "/",
    });
  });
});
