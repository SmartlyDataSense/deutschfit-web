# Spike: browser preflight vs `verify_jwt=true` on the Supabase gateway

**Date:** 2026-08-08
**Task:** S0.1 — Day-0 backend spike (`web-learner-app-master`)
**Script:** [`scripts/spike-cors-preflight.mjs`](../scripts/spike-cors-preflight.mjs)

## Question

`accueil-home` is deployed with gateway `verify_jwt=true` and is **not**
listed in `deutschfit-backend/supabase/config.toml`. `topics-list` is
deployed with `verify_jwt=false` and **is** listed. Both functions handle
`OPTIONS` in-handler with wildcard CORS. Before building the web learner
app's data layer against these functions, we need to know: does the
Supabase gateway itself block the browser's CORS preflight, or reject an
ES256 user JWT, on a function where gateway-level `verify_jwt=true` is
still in effect — before the request even reaches the function handler?

## Method

`scripts/spike-cors-preflight.mjs` runs against the dev project
(`https://ocqoqnifzlkrgcyjljpl.supabase.co`) and does three things:

1. **OPTIONS preflight** (Node `fetch`, no auth) against both functions,
   simulating a browser's CORS preflight from `http://localhost:3000`.
2. **Authenticated GET from Node** — signs in as `qa1@df.dev` via
   `supabase-js`, then calls both functions with the resulting ES256
   user JWT via plain `fetch`.
3. **Authenticated GET from a real browser context** — same JWT, same
   two functions, called via `fetch()` executed inside a Playwright
   Chromium page (`about:blank`), so the request goes through an actual
   browser's networking/CORS stack rather than Node's.

Credentials are read from environment variables only
(`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `QA_EMAIL`, `QA_PASSWORD`) and are
never written to disk or committed.

## Observed matrix (dev, 2026-08-08)

| Step                          | Function        | verify_jwt | Status | Notes |
|--------------------------------|------------------|------------|--------|-------|
| OPTIONS preflight (Node)       | `accueil-home`   | true (gateway) | **200** | `access-control-allow-origin: *` |
| OPTIONS preflight (Node)       | `topics-list`    | false      | **200** | `access-control-allow-origin: *` |
| Authenticated GET (Node)       | `accueil-home`   | true (gateway) | **200** | valid JSON body returned |
| Authenticated GET (Node)       | `topics-list`    | false      | **200** | valid JSON body returned |
| Authenticated GET (browser)    | `accueil-home`   | true (gateway) | **200** | valid JSON body returned |
| Authenticated GET (browser)    | `topics-list`    | false      | **200** | valid JSON body returned |

All six probes returned `200` with a well-formed JSON body (or, for the
OPTIONS calls, a wildcard `Access-Control-Allow-Origin`). No `401`, `403`,
or CORS rejection was observed at any layer, from either Node or a real
Chromium browser context.

## Verdict

**Gateway is ES256-tolerant and browser-preflight-tolerant even with
`verify_jwt=true` set at the gateway level. No backend change needed for
S0.**

The gateway lets the `OPTIONS` preflight through (both functions answer
it themselves in-handler, and the gateway doesn't intercept/block it
first), and it accepts the QA user's ES256-signed JWT on `accueil-home`
despite `verify_jwt=true` not being overridden to `false` in
`supabase/config.toml`. This matches `topics-list`'s already-passing
behavior. The web learner app can call `accueil-home` directly from the
browser with the standard `Authorization: Bearer <user JWT>` +
`apikey: <anon key>` header pair, the same as `topics-list`.

Per the task brief's step 4 branching: since preflight and the browser
GET both passed, **no `deutschfit-backend` PR is required** — the
36-functions-unlisted-in-config.toml condition that would have triggered
a `verify_jwt = false` config PR did not manifest for `accueil-home`
under real browser conditions.

## Caveats / scope

- This spike only exercises `accueil-home` and `topics-list`. It does not
  generalize to all 36 unlisted functions — if a future task calls
  another unlisted function from the browser and sees a gateway-level
  401/403 *before* the handler runs, re-run this spike against that
  function specifically before assuming the same tolerance holds.
- No `deutschfit-backend` files were modified, per this task's scope.

## How to re-run

```bash
SUPABASE_URL=https://ocqoqnifzlkrgcyjljpl.supabase.co \
SUPABASE_ANON_KEY=<dev anon key, from deutschfit-backend/.env.local> \
QA_EMAIL=qa1@df.dev \
QA_PASSWORD=<qa1 password> \
node scripts/spike-cors-preflight.mjs
```

Omitting `QA_EMAIL`/`QA_PASSWORD` runs steps 1–2 (OPTIONS preflight only)
and skips the authenticated GET steps.
