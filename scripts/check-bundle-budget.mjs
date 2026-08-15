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
 * Keyword markers used to attribute chunk contents to a known dependency or
 * feature area. Each pattern is checked against the chunk's raw (pre-gzip)
 * text — see `extractMarkers`.
 */
const MARKER_PATTERNS = [
  ["posthog", /posthog/i],
  ["dexie", /\bDexie\b/],
  ["i18next", /i18next/],
  // A couple of strings that only exist in the FR locale catalogs (which
  // load synchronously — see the S13 "lazy EN catalogs" change).
  ["fr-catalog", /Chargement…|Réessayer|Une erreur est survenue/],
  ["supabase", /supabase/i],
  ["__DOM_INTERNALS", /__DOM_INTERNALS/],
];

/**
 * Grep a chunk's text for known dependency/feature markers, and pull out the
 * first exported identifier the chunk defines (Turbopack's `e.s([...])`
 * export-list form, falling back to the `Object.defineProperty(r, "…")`
 * shape used by Next's compiled/vendored packages). This is attribution
 * evidence, not a guess: every reported marker or export name must come
 * from text actually present in the chunk.
 *
 * @param {Buffer} buffer
 * @returns {{ markers: string[], firstExport: string | null }}
 */
export function extractMarkers(buffer) {
  const text = buffer.toString("utf8");
  const markers = MARKER_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
  const exportMatch =
    text.match(/e\.s\(\[\s*"([A-Za-z0-9_$]+)"/) ||
    text.match(/Object\.defineProperty\((?:r|exports),\s*"([A-Za-z0-9_$]+)"/) ||
    text.match(/exports\.([A-Za-z0-9_$]+)\s*=/);
  const firstExport = exportMatch ? exportMatch[1] : null;
  return { markers, firstExport };
}

/**
 * Render `extractMarkers`' output as a single printable cell. A bare
 * `__esModule` export isn't useful attribution evidence on its own (nearly
 * every transpiled module has one), so it's dropped like a missing export.
 * When nothing useful was found, this says "unattributed" rather than
 * guessing at what the chunk contains.
 *
 * @param {{ markers: string[], firstExport: string | null }} info
 * @returns {string}
 */
export function formatMarkerCell({ markers, firstExport }) {
  const parts = [...markers];
  if (firstExport && firstExport !== "__esModule") {
    parts.push(`export:${firstExport}`);
  }
  return parts.length > 0 ? parts.join(", ") : "unattributed";
}

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
    console.error(
      "[check-bundle-budget] .next/app-build-manifest.json not found — run `npm run build` first"
    );
    process.exit(2);
    return;
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const routes = collectLearnerRoutes(manifest);

  // Read + gzip + markers-scan each unique chunk file exactly once — chunks
  // are shared across dozens of routes, so caching by file path keeps this
  // a single pass over disk instead of re-reading the same shared chunks
  // per route.
  const chunkCache = new Map();
  const chunkInfo = (file) => {
    let info = chunkCache.get(file);
    if (!info) {
      const buf = readFileSync(resolve(repoRoot, ".next", file));
      info = { gz: gzKb(buf), ...extractMarkers(buf) };
      chunkCache.set(file, info);
    }
    return info;
  };

  const rows = routes.map(({ route, files }) => {
    const gz = files.reduce((sum, file) => sum + chunkInfo(file).gz, 0);
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

  // Attribution: what's actually inside the app-shell route's first load.
  // This is the row the S13 hardening decision rule cares about — every
  // marker/export shown here comes from `extractMarkers` reading the
  // chunk's own text, not from filename or size guesses.
  const appRoute = routes.find(({ route }) => route.endsWith("(protected)/page"));
  if (appRoute) {
    const chunkRows = appRoute.files
      .map((file) => {
        const info = chunkInfo(file);
        return {
          file: file.replace("static/chunks/", ""),
          "gz (kB)": Math.round(info.gz * 10) / 10,
          markers: formatMarkerCell(info),
        };
      })
      .sort((a, b) => b["gz (kB)"] - a["gz (kB)"]);
    console.log(`\n[check-bundle-budget] chunk attribution for ${appRoute.route}:`);
    console.table(chunkRows);
  }

  if (failures.length > 0) {
    console.error(
      `[check-bundle-budget] ${failures.length} route(s) over budget:\n` +
        failures
          .map((f) => `  ${f.route}: ${Math.round(f.gz * 10) / 10} kB > ${f.budget} kB budget`)
          .join("\n")
    );
    process.exit(1);
  }

  console.log("[check-bundle-budget] all (learner) routes within budget");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
