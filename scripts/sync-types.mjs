#!/usr/bin/env node
/**
 * Copies the canonical generated Supabase types from deutschfit-backend
 * into this repo at src/shared/database.types.ts.
 *
 * The backend repo owns regeneration (`npm run types:gen` against the dev
 * project). This script just mirrors the committed artifact so the web app
 * can `import type { Database } from "@/shared/database.types"` without each
 * consumer running their own MCP regen.
 *
 * Run any time the backend bumps the types file:
 *   npm run types:sync
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const backendRoot = resolve(repoRoot, "..", "deutschfit-backend");
const source = resolve(backendRoot, "src/shared/database.types.ts");
const target = resolve(repoRoot, "src/shared/database.types.ts");

if (!existsSync(source)) {
  console.error(
    `[sync-types] Source not found: ${source}\n` +
      `Expected sibling checkout at ${backendRoot}.\n` +
      `Clone deutschfit-backend next to deutschfit-web, or pull latest.`,
  );
  process.exit(1);
}

mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);

const { size } = statSync(target);
console.log(`[sync-types] Copied database.types.ts (${size} bytes)`);
console.log(`  from: ${source}`);
console.log(`  to:   ${target}`);
