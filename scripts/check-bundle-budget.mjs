#!/usr/bin/env node
/**
 * Bundle-budget guard for the (learner) route group.
 *
 * Metric: gzip level-9 byte size (KiB) of the JS files listed for a route
 * in `.next/app-build-manifest.json`, summed. This is intentionally not the
 * same number Next.js prints in its own build output table (which uses a
 * different aggregation) — the guard is internally consistent, not a mirror
 * of `next build`'s summary.
 *
 * Budgets:
 *   - the bare `(protected)/page` route (the learner app shell): <= appBudget
 *   - every other `(learner)` route: <= routeBudget
 *
 * Usage: node scripts/check-bundle-budget.mjs
 *   (run `npm run build` first — this reads the `.next/` build output)
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const APP_BUDGET_KB = 300;
const ROUTE_BUDGET_KB = 320;

/**
 * Extract the `(learner)` routes and their JS files from a Next.js
 * app-build-manifest.
 *
 * @param {{ pages: Record<string, string[]> }} manifest
 * @returns {Array<{ route: string, files: string[] }>}
 */
export function collectLearnerRoutes(manifest) {
  return Object.entries(manifest.pages)
    .filter(([route]) => route.includes("(learner)"))
    .map(([route, files]) => ({
      route,
      files: files.filter((f) => f.endsWith(".js")),
    }));
}

/**
 * Gzip (level 9) a buffer and return its size in KiB.
 *
 * @param {Buffer} buffer
 * @returns {number}
 */
export function gzKb(buffer) {
  return gzipSync(buffer, { level: 9 }).length / 1024;
}

/**
 * Evaluate measured route rows against budgets.
 *
 * The bare `(protected)/page` route (the learner app shell) is held to
 * `appBudget`; every other `(learner)` route is held to `routeBudget`.
 *
 * @param {Array<{ route: string, gz: number }>} rows
 * @param {{ appBudget: number, routeBudget: number }} budgets
 * @returns {{ failures: Array<{ route: string, gz: number, budget: number }>, table: Array<{ route: string, gz: number, budget: number, status: string }> }}
 */
export function evaluate(rows, { appBudget, routeBudget }) {
  const table = rows.map((row) => {
    const isAppRoute = row.route.endsWith("(protected)/page");
    const budget = isAppRoute ? appBudget : routeBudget;
    const status = row.gz > budget ? "FAIL" : "ok";
    return { route: row.route, gz: row.gz, budget, status };
  });
  const failures = table.filter((row) => row.status === "FAIL");
  return { failures, table };
}

async function main() {
  const __dirname = fileURLToPath(new URL(".", import.meta.url));
  const repoRoot = resolve(__dirname, "..");
  const manifestPath = resolve(repoRoot, ".next/app-build-manifest.json");

  if (!existsSync(manifestPath)) {
    console.error("[check-bundle-budget] .next/app-build-manifest.json not found — run `npm run build` first");
    process.exit(2);
    return;
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const routes = collectLearnerRoutes(manifest);

  const rows = routes.map(({ route, files }) => {
    const gz = files.reduce((sum, file) => {
      const filePath = resolve(repoRoot, ".next", file);
      const buf = readFileSync(filePath);
      return sum + gzKb(buf);
    }, 0);
    return { route, gz };
  });

  const { failures, table } = evaluate(rows, {
    appBudget: APP_BUDGET_KB,
    routeBudget: ROUTE_BUDGET_KB,
  });

  const sorted = [...table].sort((a, b) => b.gz - a.gz);
  const printable = sorted.map((row) => ({
    route: row.route,
    "gz (kB)": Math.round(row.gz * 10) / 10,
    budget: row.budget,
    status: row.status,
  }));

  console.table(printable);

  if (failures.length > 0) {
    console.error(
      `[check-bundle-budget] ${failures.length} route(s) over budget:\n` +
        failures
          .map((f) => `  ${f.route}: ${Math.round(f.gz * 10) / 10} kB > ${f.budget} kB budget`)
          .join("\n"),
    );
    process.exit(1);
  }

  console.log("[check-bundle-budget] all (learner) routes within budget");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
