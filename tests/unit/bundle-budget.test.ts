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
});
