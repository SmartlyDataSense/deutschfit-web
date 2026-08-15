import { describe, expect, it } from "vitest";
import { collectLearnerRoutes, evaluate, gzKb } from "../../scripts/check-bundle-budget.mjs";

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
    // redundancy that level 9's deeper match search finds a smaller
    // encoding than level 6 (verified locally: level 6 -> 584 bytes,
    // level 9 -> 580 bytes for this exact input), so pinning the level-9
    // byte count actually exercises the `{ level: 9 }` option.
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff);
    let json = "[";
    for (let i = 0; i < 50; i++) {
      json += `{"id":${rnd() % 100000},"name":"user${rnd() % 1000}","active":${rnd() % 2 === 0},"score":${(rnd() % 10000) / 100}},`;
    }
    json += "]";
    // 580 bytes gzip(level 9) / 1024 = the level-9 answer; level 6 on the
    // same input would be 584 / 1024, so this fails if gzKb regresses to
    // a different level.
    expect(gzKb(Buffer.from(json))).toBe(580 / 1024);
  });
  it("fails the app route above 300 and other learner routes above 320", () => {
    const rows = [
      { route: "/[locale]/(learner)/app/(protected)/page", gz: 300.1 },
      { route: "/[locale]/(learner)/app/(protected)/srs/page", gz: 320.1 },
    ];
    expect(evaluate(rows, { appBudget: 300, routeBudget: 320 }).failures).toHaveLength(2);
    expect(
      evaluate(
        [{ route: "/[locale]/(learner)/app/(protected)/page", gz: 300 }],
        { appBudget: 300, routeBudget: 320 }
      ).failures
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
