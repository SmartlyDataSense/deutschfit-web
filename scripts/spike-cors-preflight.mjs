#!/usr/bin/env node
// Probes whether the Supabase gateway lets a browser preflight (and an
// authenticated ES256 user JWT) through on functions deployed with
// verify_jwt=true (accueil-home) vs verify_jwt=false (topics-list).
//
// Required env (never hardcode/commit credentials):
//   SUPABASE_URL       - dev project URL, e.g. https://ocqoqnifzlkrgcyjljpl.supabase.co
//   SUPABASE_ANON_KEY  - dev project anon key
//   QA_EMAIL            - QA login email (optional; skips step 3 if absent)
//   QA_PASSWORD          - QA login password (optional; skips step 3 if absent)
//
// Usage:
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... QA_EMAIL=... QA_PASSWORD=... \
//     node scripts/spike-cors-preflight.mjs
//
// Step 3's browser-context check uses Playwright (chromium) already
// installed in this repo's devDependencies.

import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";

const BASE = process.env.SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const QA_EMAIL = process.env.QA_EMAIL;
const QA_PASSWORD = process.env.QA_PASSWORD;

if (!BASE || !ANON_KEY) {
  console.error("Missing required env: SUPABASE_URL and SUPABASE_ANON_KEY must be set.");
  process.exit(1);
}

const FUNCTIONS = ["accueil-home", "topics-list"];

// --- Step 1+2: OPTIONS preflight probe (Node fetch, no browser) ---
const probePreflight = async (fn) => {
  const r = await fetch(`${BASE}/functions/v1/${fn}`, {
    method: "OPTIONS",
    headers: {
      Origin: "http://localhost:3000",
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "authorization,apikey,content-type",
    },
  });
  return {
    step: "OPTIONS-preflight (node)",
    fn,
    status: r.status,
    allowOrigin: r.headers.get("access-control-allow-origin"),
  };
};

console.log("\n=== Step 1+2: OPTIONS preflight (Node fetch) ===");
const preflightResults = await Promise.all(FUNCTIONS.map(probePreflight));
console.table(preflightResults);

// --- Step 3: Authenticated GET, from Node and from a browser context ---
let authedResults = [];

if (!QA_EMAIL || !QA_PASSWORD) {
  console.log("\n=== Step 3: SKIPPED (QA_EMAIL / QA_PASSWORD not set in env) ===");
} else {
  console.log("\n=== Step 3: Authenticated GET (Node + browser) ===");

  const supabase = createClient(BASE, ANON_KEY);
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: QA_EMAIL,
    password: QA_PASSWORD,
  });

  if (signInError || !signInData?.session?.access_token) {
    console.error("QA sign-in failed:", signInError?.message ?? "no session");
    process.exit(1);
  }

  const userJwt = signInData.session.access_token;

  // 3a: Node fetch with the user's JWT
  const probeAuthedNode = async (fn) => {
    const r = await fetch(`${BASE}/functions/v1/${fn}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${userJwt}`,
        apikey: ANON_KEY,
      },
    });
    const bodyText = await r.text();
    let bodyPreview = bodyText;
    try {
      bodyPreview = JSON.stringify(JSON.parse(bodyText)).slice(0, 200);
    } catch {
      bodyPreview = bodyText.slice(0, 200);
    }
    return { step: "authed-GET (node)", fn, status: r.status, bodyPreview };
  };

  const nodeResults = await Promise.all(FUNCTIONS.map(probeAuthedNode));
  console.table(nodeResults);

  // 3b: Browser context (chromium, about:blank) with the user's JWT
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto("about:blank");

  const browserResults = await page.evaluate(
    async ({ base, fns, jwt, anonKey }) => {
      const out = [];
      for (const fn of fns) {
        try {
          const r = await fetch(`${base}/functions/v1/${fn}`, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${jwt}`,
              apikey: anonKey,
            },
          });
          const bodyText = await r.text();
          let bodyPreview = bodyText;
          try {
            bodyPreview = JSON.stringify(JSON.parse(bodyText)).slice(0, 200);
          } catch {
            bodyPreview = bodyText.slice(0, 200);
          }
          out.push({ fn, status: r.status, bodyPreview });
        } catch (err) {
          out.push({ fn, status: "FETCH_ERROR", bodyPreview: String(err) });
        }
      }
      return out;
    },
    { base: BASE, fns: FUNCTIONS, jwt: userJwt, anonKey: ANON_KEY }
  );

  console.table(browserResults.map((r) => ({ step: "authed-GET (browser)", ...r })));

  await browser.close();
  await supabase.auth.signOut();

  authedResults = [
    ...nodeResults.map((r) => ({ ...r, context: "node" })),
    ...browserResults.map((r) => ({
      step: "authed-GET (browser)",
      context: "browser",
      ...r,
    })),
  ];
}

// --- Machine-readable summary for the report/doc ---
console.log("\n=== JSON summary ===");
console.log(JSON.stringify({ preflightResults, authedResults }, null, 2));
