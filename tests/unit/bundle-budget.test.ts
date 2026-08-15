import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  collectLearnerRoutes,
  evaluate,
  extractMarkers,
  formatMarkerCell,
  gzKb,
  hasMeasurableRoutes,
} from "../../scripts/check-bundle-budget.mjs";

const manifest = {
  pages: {
    "/[locale]/(learner)/app/(protected)/page": ["static/chunks/a.js"],
    "/[locale]/(learner)/app/(protected)/srs/page": ["static/chunks/b.js"],
    "/[locale]/(admin)/admin/page": ["static/chunks/c.js"],
  },
};

describe("check-bundle-budget", () => {
  it("collects only (learner) routes", () => {
    const routes = collectLearnerRoutes(manifest);
    expect(routes.map((r) => r.route)).toEqual([
      "/[locale]/(learner)/app/(protected)/page",
      "/[locale]/(learner)/app/(protected)/srs/page",
    ]);
  });
  it("gzKb measures gzip level 9", () => {
    expect(gzKb(Buffer.from("a".repeat(100_000)))).toBeLessThan(1);
  });
  it("gzKb compresses at level 9, not some other level", () => {
    // A run of one repeated character compresses identically at every zlib
    // level (level 6 and level 9 both produce 133 bytes for 100_000 "a"s),
    // so it can't tell gzKb apart from an implementation that forgot
    // { level: 9 }. This fixture — repeated-but-varying JSON records built
    // from a small deterministic LCG — has just enough near-but-not-exact
    // redundancy that level 9's deeper match search finds a materially
    // smaller encoding than the default level 6.
    //
    // The expected size is computed here rather than hardcoded: exact gzip
    // output is a property of the linked zlib, not of the input, and it
    // differs between Node majors (this test first shipped pinned to the
    // local Node 26 byte count and failed on CI's Node 20 — 565 bytes
    // there vs 580 here for the same bytes). Deriving it keeps the test
    // portable; the level-6 guard below is what keeps it discriminating.
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff);
    let json = "[";
    for (let i = 0; i < 400; i++) {
      json += `{"id":${rnd() % 100000},"name":"user${rnd() % 1000}","active":${rnd() % 2 === 0},"score":${(rnd() % 10000) / 100}},`;
    }
    json += "]";
    const bytes = Buffer.from(json);
    const atLevel9 = gzipSync(bytes, { level: 9 }).length;
    const atLevel6 = gzipSync(bytes, { level: 6 }).length;
    // Guards the fixture itself: if some future zlib made the two levels
    // agree here, the assertion below would still pass while proving
    // nothing. 400 records opens a ~50-byte gap on zlib 1.2.12 — wide
    // enough that a version bump narrowing it stays visible.
    expect(atLevel6).toBeGreaterThan(atLevel9);
    expect(gzKb(bytes)).toBe(atLevel9 / 1024);
  });
  it("fails the app route above 300 and other learner routes above 320", () => {
    const rows = [
      { route: "/[locale]/(learner)/app/(protected)/page", gz: 300.1 },
      { route: "/[locale]/(learner)/app/(protected)/srs/page", gz: 320.1 },
    ];
    expect(evaluate(rows, { appBudget: 300, routeBudget: 320 }).failures).toHaveLength(2);
    expect(
      evaluate([{ route: "/[locale]/(learner)/app/(protected)/page", gz: 300 }], {
        appBudget: 300,
        routeBudget: 320,
      }).failures
    ).toHaveLength(0);
  });
  it("uses the route-specific budget, not the app budget, for non-app routes", () => {
    // 310 sits strictly between appBudget (300) and routeBudget (320): it
    // only passes if the srs/page row is actually checked against 320. An
    // implementation that collapsed both branches to `appBudget` (as in
    // the mutation this test was written to catch) would flag it, since
    // 310 > 300.
    const rows = [{ route: "/[locale]/(learner)/app/(protected)/srs/page", gz: 310 }];
    expect(evaluate(rows, { appBudget: 300, routeBudget: 320 }).failures).toHaveLength(0);
  });
});

describe("hasMeasurableRoutes — S13 final-fixes finding 3: check:bundle must not pass vacuously", () => {
  // Before this guard, `main()` fed an empty `routes` array straight into
  // `evaluate`, whose `failures` array is then trivially empty too —
  // `console.table([])` prints nothing and the script logs "all
  // (learner) routes within budget" and exits 0, having enforced no
  // budget at all. Mirrors the floor
  // `tests/unit/learner-source-scan.test.ts` already has for its own
  // file walk ("scans nothing, passes for the wrong reason").
  it("is false for zero routes", () => {
    expect(hasMeasurableRoutes([])).toBe(false);
  });

  it("is true once at least one route was found", () => {
    expect(
      hasMeasurableRoutes([{ route: "/[locale]/(learner)/app/(protected)/page", files: [] }])
    ).toBe(true);
  });

  it("reproduces the reviewer's exact repro: renaming (learner) -> (app) in the manifest silently zeroes out routes", () => {
    // routes found: 0 | failures: 0 | would exit 0 — pre-guard, nothing
    // downstream of `collectLearnerRoutes` catches this.
    const renamedManifest = {
      pages: {
        "/[locale]/(app)/app/(protected)/page": ["static/chunks/a.js"],
        "/[locale]/(app)/app/(protected)/srs/page": ["static/chunks/b.js"],
      },
    };
    const routes = collectLearnerRoutes(renamedManifest);
    expect(routes).toHaveLength(0);
    expect(
      evaluate(
        routes.map((r) => ({ route: r.route, gz: 0 })),
        {
          appBudget: 300,
          routeBudget: 320,
        }
      ).failures
    ).toHaveLength(0); // the vacuous "pass" evaluate() alone would report
    expect(hasMeasurableRoutes(routes)).toBe(false); // the guard catches what evaluate() can't
  });
});

describe("extractMarkers", () => {
  it("detects posthog", () => {
    expect(
      extractMarkers(Buffer.from('function initPostHog(){posthog.init("x")}')).markers
    ).toContain("posthog");
  });
  it("detects dexie", () => {
    expect(extractMarkers(Buffer.from("class LearnerDexie extends Dexie {}")).markers).toContain(
      "dexie"
    );
  });
  it("detects i18next", () => {
    expect(extractMarkers(Buffer.from("var i=e.i(1);i18next.init({})")).markers).toContain(
      "i18next"
    );
  });
  it("detects the FR catalog marker", () => {
    expect(extractMarkers(Buffer.from('{"status":{"loading":"Chargement…"}}')).markers).toContain(
      "fr-catalog"
    );
  });
  it("detects supabase", () => {
    expect(
      extractMarkers(Buffer.from("https://ocqoqnifzlkrgcyjljpl.supabase.co")).markers
    ).toContain("supabase");
  });
  it("detects __DOM_INTERNALS", () => {
    expect(
      extractMarkers(Buffer.from("__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE"))
        .markers
    ).toContain("__DOM_INTERNALS");
  });
  it("detects multiple markers in the same chunk", () => {
    const buf = Buffer.from("Dexie; supabase.co; posthog.init()");
    const { markers } = extractMarkers(buf);
    expect(markers).toEqual(expect.arrayContaining(["dexie", "supabase", "posthog"]));
  });
  it("returns no markers and no export for unrelated text", () => {
    const { markers, firstExport } = extractMarkers(Buffer.from("var x = 1 + 2;"));
    expect(markers).toEqual([]);
    expect(firstExport).toBeNull();
  });
  it("extracts the first Turbopack e.s(...) export name", () => {
    const { firstExport } = extractMarkers(
      Buffer.from('e.s(["fetchAccueilHome",()=>o,"updateExamDate",()=>i],90285)')
    );
    expect(firstExport).toBe("fetchAccueilHome");
  });
  it("extracts the first Object.defineProperty export name as a fallback", () => {
    const { firstExport } = extractMarkers(
      Buffer.from(
        'Object.defineProperty(r,"invalidateCacheBelowFlightSegmentPath",{enumerable:!0})'
      )
    );
    expect(firstExport).toBe("invalidateCacheBelowFlightSegmentPath");
  });
});

describe("formatMarkerCell", () => {
  it("joins markers and the export name when both are present", () => {
    expect(formatMarkerCell({ markers: ["dexie"], firstExport: "getLearnerDb" })).toBe(
      "dexie, export:getLearnerDb"
    );
  });
  it("falls back to just the markers when there is no useful export", () => {
    expect(formatMarkerCell({ markers: ["posthog"], firstExport: null })).toBe("posthog");
  });
  it("falls back to just the export when there are no keyword markers", () => {
    expect(formatMarkerCell({ markers: [], firstExport: "fetchAccueilHome" })).toBe(
      "export:fetchAccueilHome"
    );
  });
  it("reports 'unattributed' rather than guessing when nothing useful was found", () => {
    expect(formatMarkerCell({ markers: [], firstExport: null })).toBe("unattributed");
  });
  it("treats a bare __esModule export as not useful on its own", () => {
    expect(formatMarkerCell({ markers: [], firstExport: "__esModule" })).toBe("unattributed");
  });
});
