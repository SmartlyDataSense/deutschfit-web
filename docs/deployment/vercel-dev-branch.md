# Vercel — `dev` branch auto-deploy plan

> Goal: every push to `dev` builds and serves at a stable URL — `https://dev.deutschfit.app` — with env vars pointed at the **dev Supabase project**, while production (`main` → `deutschfit.app`) keeps pointing at the prod Supabase project.

Last audit: 2026-04-26.

---

## Section A — Current state (audit findings)

Pulled live from the Vercel team `deutschfit` via the CLI + REST API on 2026-04-26.

**Project**

| Field                      | Value                                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Project ID                 | `prj_wvOsuASMN7ApDWznrBG9wWzRxXKI`                                                                                       |
| Team                       | `DeutschFit` (slug `deutschfit`, id `team_VhfPsDrx6DsRoB2Cvy6hDvN4`)                                                     |
| Framework preset           | `nextjs`                                                                                                                 |
| Production branch          | `main`                                                                                                                   |
| Root directory             | `.`                                                                                                                      |
| Build command              | `next build` (set in `vercel.json`)                                                                                      |
| Install command            | `npm ci --no-audit --no-fund`                                                                                            |
| Node.js version            | `24.x`                                                                                                                   |
| Region                     | `fra1`                                                                                                                   |
| Linked GitHub repo         | `SmartlyDataSense/deutschfit-web` (type `github`)                                                                        |
| Git deployments            | enabled for `main`, `preprod`, `dev` (`vercel.json`)                                                                     |
| Auto-assign custom domains | `true` (production deploys auto-assign attached production-aliased domains)                                              |
| Password protection        | none                                                                                                                     |
| SSO protection             | **ON** — `deploymentType: all_except_custom_domains` (raw `*.vercel.app` URLs require Vercel SSO; custom domains bypass) |

**Domains currently attached to the project**

| Domain                      | Verified | Git branch | Redirect         |
| --------------------------- | -------- | ---------- | ---------------- |
| `deutschfit.app`            | yes      | none       | none             |
| `www.deutschfit.app`        | yes      | none       | `deutschfit.app` |
| `deutschfit-web.vercel.app` | yes      | none       | none             |

None of the attached domains is pinned to a specific Git branch yet. The apex (`deutschfit.app`) currently aliases to whichever production deploy is latest because `autoAssignCustomDomains: true` and the production branch is `main`.

**`deutschfit.app` registrar / DNS**

- Registrar: Third Party
- Current nameservers: `dion.ns.cloudflare.com`, `keyla.ns.cloudflare.com` (Cloudflare)
- Vercel's intended nameservers (`ns1/ns2.vercel-dns.com`) are **not** in use — DNS is managed at Cloudflare, so subdomains for Vercel must be added there as `CNAME` records, **not** in Vercel's DNS panel.

**`dev` branch deployments**

- Last 5 dev deploys: all `Ready` (succeeded). Two earlier failures (`Error`) occurred ~15h ago on different branches, not `dev`.
- Vercel already emits a **stable Git-branch alias** for `dev`: `https://deutschfit-web-git-dev-deutschfit.vercel.app` — this is the URL the user wants, except it sits behind Vercel SSO because it's a `.vercel.app` host.
- Each push also produces a unique deploy URL like `https://deutschfit-1xjc10dby-deutschfit.vercel.app`.

**No `dev.deutschfit.app` is wired today.**

**Env var matrix (names + scopes — values not echoed)**

| Variable name                   | Development | Preview     | Production  |
| ------------------------------- | ----------- | ----------- | ----------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | yes         | yes         | yes         |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes         | yes         | yes         |
| `SUPABASE_SERVICE_ROLE_KEY`     | yes         | yes         | yes         |
| `RESEND_API_KEY`                | yes         | yes         | yes         |
| `NEXT_PUBLIC_SITE_URL`          | yes         | yes         | yes         |
| `NEXT_PUBLIC_PAY_EMAIL`         | yes         | yes         | yes         |
| `NEXT_PUBLIC_PAY_MOMO_NUMBER`   | **missing** | **missing** | **missing** |
| `NEXT_PUBLIC_PAY_OM_NUMBER`     | **missing** | **missing** | **missing** |
| `NEXT_PUBLIC_PAY_BANK_DETAILS`  | **missing** | **missing** | **missing** |
| `NEXT_PUBLIC_PAY_PAYPAL_HANDLE` | **missing** | **missing** | **missing** |
| `NEXT_PUBLIC_PAY_WISE_HANDLE`   | **missing** | **missing** | **missing** |

Two issues this surfaces:

1. **Preview and Production share the same value for every var.** Today, a `dev` branch push gets the _prod_ Supabase URL + service-role key. That's the exact thing this plan fixes — Preview must be re-pointed at the dev Supabase project.
2. **Five payment-handle vars from `.env.local.example` aren't in Vercel.** Their `process.env.*` reads return `undefined`, so the corresponding payment channels render as "Coming soon" placeholders. That's deliberate today, but plan the back-fill before the public pricing page goes live.

---

## Section B — Recommended setup (option 2: stable `dev.deutschfit.app`)

This keeps a single Vercel project, attaches a custom subdomain pinned to the `dev` branch, and re-scopes Preview env vars to the dev Supabase project. Production stays untouched.

### B1. DNS — add `dev` CNAME at Cloudflare

In Cloudflare → `deutschfit.app` zone → DNS → Records → **Add record**:

| Field  | Value                                 |
| ------ | ------------------------------------- |
| Type   | `CNAME`                               |
| Name   | `dev`                                 |
| Target | `cname.vercel-dns.com`                |
| TTL    | Auto                                  |
| Proxy  | **DNS only** (grey cloud — proxy OFF) |

The proxy must stay OFF: Vercel needs a direct CNAME to issue and renew the Let's Encrypt cert via HTTP-01. Cloudflare's orange-cloud proxy interferes with that handshake.

### B2. Vercel — assign `dev.deutschfit.app` to the `dev` branch

Vercel dashboard → `deutschfit-web` → **Settings → Domains** → **Add Domain**.

1. Enter `dev.deutschfit.app`.
2. When prompted, choose **Add to project** (not "Redirect").
3. Once added, click the new domain's row → **Edit** → **Git Branch** → set to `dev`.
4. Vercel verifies the CNAME (B1 must be live first — usually < 5 min) and provisions the cert. The page will show:
   - "Valid Configuration" once DNS resolves
   - "Certificate issued" once Let's Encrypt completes (typically 1–5 min after DNS verifies)

CLI alternative (run from a shell that's `vercel login`-ed against the `deutschfit` team):

```bash
vercel domains add dev.deutschfit.app deutschfit-web --scope deutschfit
# Then in the dashboard, edit the domain row to set Git Branch = dev.
# (CLI does not expose the per-branch assignment yet — must be done in the UI.)
```

### B3. Re-scope **Preview** env vars to the dev Supabase project

Today every Preview deploy uses the prod Supabase project's URL + keys. Remove the Preview-scoped values and re-add them, pointed at the dev Supabase project. Production scope is **untouched** — those values stay pointing at the prod Supabase project (or get re-set later when prod ships, see B4).

For each variable below, run `rm` then `add`. Keep the values out of git — the CLI will prompt for the value interactively, or you can pipe from a local file you already have.

```bash
# 1. Remove the current Preview-scoped value (was a copy of prod).
vercel env rm NEXT_PUBLIC_SUPABASE_URL preview --scope deutschfit
vercel env rm NEXT_PUBLIC_SUPABASE_ANON_KEY preview --scope deutschfit
vercel env rm SUPABASE_SERVICE_ROLE_KEY preview --scope deutschfit
vercel env rm RESEND_API_KEY preview --scope deutschfit
vercel env rm NEXT_PUBLIC_SITE_URL preview --scope deutschfit
vercel env rm NEXT_PUBLIC_PAY_EMAIL preview --scope deutschfit

# 2. Add the dev-Supabase versions.
vercel env add NEXT_PUBLIC_SUPABASE_URL preview --scope deutschfit
# → paste: https://<dev-supabase-ref>.supabase.co

vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY preview --scope deutschfit
# → paste: <dev anon / publishable key>

vercel env add SUPABASE_SERVICE_ROLE_KEY preview --scope deutschfit
# → paste: <dev service-role key>  (server-only, bypasses RLS)

vercel env add RESEND_API_KEY preview --scope deutschfit
# → paste: <Resend API key>  (can stay shared with prod or use a separate
#   Resend audience for staging — your call)

vercel env add NEXT_PUBLIC_SITE_URL preview --scope deutschfit
# → paste: https://dev.deutschfit.app

vercel env add NEXT_PUBLIC_PAY_EMAIL preview --scope deutschfit
# → paste: support@deutschfit.app  (or staging-specific)
```

Then back-fill the payment-handle vars on **all three scopes** (development, preview, production) so the public `/how-to-pay` page renders real channels instead of "Coming soon":

```bash
for var in NEXT_PUBLIC_PAY_MOMO_NUMBER NEXT_PUBLIC_PAY_OM_NUMBER \
           NEXT_PUBLIC_PAY_BANK_DETAILS NEXT_PUBLIC_PAY_PAYPAL_HANDLE \
           NEXT_PUBLIC_PAY_WISE_HANDLE; do
  vercel env add "$var" preview     --scope deutschfit
  vercel env add "$var" production  --scope deutschfit
  vercel env add "$var" development --scope deutschfit
done
```

> Reminder: `NEXT_PUBLIC_*` vars are inlined into the JS bundle at build time. After changing any of them, **redeploy** (or trigger a new `dev` push) — env-var changes don't apply to deploys that already exist.

### B4. Production scope — flag for later

The Production scope today still points at the prod Supabase project (it was set when the project was created). This is fine for now, but **do not assume the values are correct on prod-ship day**. When the time comes:

```bash
# Same six core vars, scoped Production, pointed at the prod Supabase project.
# Defer running these until the prod cutover plan (Section E).
```

Authority: only `@jordanmoyo` should rotate Production-scope secrets. Sub-agents must not.

### B5. Verification

After B1–B3 complete:

1. **Confirm DNS:** `dig +short dev.deutschfit.app CNAME` → returns `cname.vercel-dns.com.`.
2. **Confirm cert:** Vercel dashboard → Domains → `dev.deutschfit.app` shows green "Valid Configuration" + "Certificate issued".
3. **Trigger a deploy:** push a no-op commit to `dev` (or re-deploy the latest dev commit from the dashboard).
4. **Hit the URL:** open `https://dev.deutschfit.app` in a fresh browser session (no Vercel login). Page loads without an SSO wall — that's the win versus the raw `.vercel.app` host.
5. **Round-trip check (Supabase):** open `https://dev.deutschfit.app/account`, request a magic link, confirm:
   - the email arrives (Resend logs)
   - the callback URL points at `dev.deutschfit.app` (i.e. `NEXT_PUBLIC_SITE_URL` resolved correctly at build time)
   - the user row appears in the **dev** Supabase project's `auth.users` (NOT prod)

If step 5 lands in the prod Supabase project, the rebuild after the Preview env-var rotation didn't fire. Trigger a fresh deploy and re-check.

---

## Section C — Alternatives considered

**Option 1 — preview-only URL (default, no extra DNS).** Vercel already emits `https://deutschfit-web-git-dev-deutschfit.vercel.app` as a stable Git-branch alias for every push to `dev`. Zero config cost and zero DNS work. **Ruled out** because the project's SSO protection (`deploymentType: all_except_custom_domains`) gates every `*.vercel.app` URL behind Vercel team-member login. QA testers, App Review reviewers, and external stakeholders can't open it without a Vercel account on the team — defeats the "share a URL" goal.

**Option 3 — two separate Vercel projects (dev project + prod project).** Cleanest blast radius: dev and prod cannot ever share env-var state, and a misconfiguration in one can't bleed into the other. **Ruled out** for v1.0 because (a) the maintenance cost (two Git integrations, two Speed Insights, two domain panels, two env-var matrices to keep in sync) outweighs the marginal isolation gain at this scale, and (b) Vercel's per-environment scoping (Preview vs Production within one project) already enforces the practical separation we need — a Preview build literally cannot read Production-scoped secrets. Re-evaluate post-v1 if multi-tenant or compliance pressure raises the bar.

---

## Section D — What still requires user authorization

A sub-agent cannot do these. Run them as `@jordanmoyo`.

- **Cloudflare DNS** — adding the `dev` CNAME (B1). Cloudflare API access is not exposed to agents.
- **Vercel domain assignment** — adding `dev.deutschfit.app` to the project and pinning it to the `dev` branch (B2). The MCP `deploy_to_vercel` tool is write-scoped, but agents are explicitly read-only on this audit; the dashboard or `vercel domains add` is faster anyway.
- **Env-var values** — the `vercel env rm` / `vercel env add` commands (B3). Values must come from a trusted local source (1Password, encrypted notes); never commit them, never paste them in chat.
- **Production-scope env-var rotation** — deferred to prod cutover (B4 / Section E). User-only.
- **Supabase project allowed-redirects** — in the dev Supabase project, Authentication → URL Configuration, add `https://dev.deutschfit.app/**` to the allow-list so magic-link callbacks aren't rejected.

---

## Section E — Follow-ups

**Prod cutover (when `dev` matures and `main` becomes the production branch in earnest)**

- Today `main` is already the production branch and `deutschfit.app` already aliases to its latest deploy — so structurally, prod is already wired.
- The actual cutover work is: (a) merge `dev → preprod`, smoke-test on `preprod-deutschfit-web-git-preprod-deutschfit.vercel.app` (or pin a `preprod.deutschfit.app` if useful), then `preprod → main`; (b) at that moment, re-verify that Production-scope env vars (Section B4) point at the prod Supabase project, not stale dev values; (c) flip `autoAssignCustomDomains` only if you want to gate apex aliasing manually. Document the steps in `docs/deployment/prod-cutover.md` when this becomes near-term.

**Preview protection**

- Vercel's project-level SSO is currently `all_except_custom_domains`. That's the right setting for option 2: shareable custom-domain previews + locked-down raw `*.vercel.app` URLs.
- If App Review (App Store / Play) needs to inspect a build at a public URL pre-submit, `dev.deutschfit.app` is the URL to give them — no auth needed. If you ever want a _password_ gate on `dev.deutschfit.app` (closed beta, paywall preview, leak protection), enable Project → Deployment Protection → Password Protection and scope it to "Production custom domains" or specifically to `dev.deutschfit.app`.

**Observability**

- Speed Insights is already enabled on the project (`speedInsights.enabledAt` is set, `hasData: false` because no production traffic yet). Sentry / Logflare / Axiom integration is not wired. Pre-v1 ship, consider:
  - Sentry browser SDK in `src/app/layout.tsx` with DSN env var (`NEXT_PUBLIC_SENTRY_DSN`) — different DSN per scope so dev errors don't pollute prod issues.
  - Vercel → Integrations → Sentry (one-click) handles env-var auto-provisioning per scope.

---

## Appendix — One-line summary of the change shape

```
                         deutschfit.app  ──► production deploys (main branch)  ──► prod Supabase
        (today)         www.deutschfit.app ──► redirect to apex                    │
                                                                                   │
                                                                                   │
                              (NEW)         dev.deutschfit.app  ──► dev branch ────► dev Supabase
                                                                  preview deploys
```

Single Vercel project, two custom-domain endpoints, two env-var scopes, two Supabase projects. No project split, no DNS provider migration.
