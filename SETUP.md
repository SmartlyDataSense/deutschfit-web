# DeutschFit web — first-time setup

This file is the operator-only handover for the steps Claude cannot run
autonomously: creating the GitHub remote, linking it to Vercel, and seeding
the production secrets. Once these steps are done, day-to-day development is
fully owned by the agent workflow.

> Run these from the repo root (`repos/deutschfit-web`).

## 1. Local sanity check

```bash
npm install
npm run preflight
```

`preflight` runs `typecheck && lint && format:check && test:run && build`.
If anything fails locally, fix it before pushing — the same set of commands
run in CI on every PR.

## 2. Create the GitHub repo

The repo does not yet exist on GitHub. Create it under your personal account
and push the local main:

```bash
gh repo create jordanmoyo/deutschfit-web \
  --private \
  --source=. \
  --description "DeutschFit public web + back-office (Next.js)" \
  --remote=origin

git push -u origin main
```

> The `gh repo create` step is intentionally NOT scripted into the agent
> workflow — repo creation is a one-time operator action and Claude must not
> create remotes autonomously.

After pushing, set up branch protection on `main` (Settings → Branches →
Branch protection rules):

- Require a pull request before merging
- Require status checks: `lint-typecheck-test-build`
- Require branches to be up to date before merging
- Restrict pushes that create matching branches to admins only

## 3. Link Vercel

```bash
# from repo root
npx vercel link
npx vercel git connect
```

Pick the `jordanmoyo` Vercel team (or personal) and select the
`deutschfit-web` project (or let Vercel create it). The `vercel.json` in this
repo pins the framework to Next.js, the build region to `fra1` (Frankfurt —
closest to EU users and to the Supabase EU project), and enables Git
deployments for the `main`, `preprod`, and `dev` branches only.

## 4. Seed Vercel environment variables

Set these in the Vercel dashboard (Project → Settings → Environment
Variables) for each environment (Preview + Production). The
`.env.local.example` in this repo is the canonical list.

Required (server):

- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `RESEND_FROM`
- `OPERATOR_MOMO_NUMBER`
- `OPERATOR_OM_NUMBER`
- `OPERATOR_BANK_DETAILS`
- `OPERATOR_PAYPAL_EMAIL` (optional in v1)
- `OPERATOR_WISE_HANDLE` (optional in v1)

Required (public — exposed to the browser at build time):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL` (e.g. `https://deutschfit.vercel.app` or the custom
  domain once attached)
- `NEXT_PUBLIC_PAYMENT_MOMO_ENABLED`
- `NEXT_PUBLIC_PAYMENT_OM_ENABLED`
- `NEXT_PUBLIC_PAYMENT_BANK_ENABLED`
- `NEXT_PUBLIC_PAYMENT_PAYPAL_ENABLED`
- `NEXT_PUBLIC_PAYMENT_WISE_ENABLED`

## 5. Custom domain (optional, can be done later)

```bash
npx vercel domains add deutschfit.com
```

Then point your registrar's DNS A/AAAA records at Vercel's IPs. Update
`NEXT_PUBLIC_SITE_URL` once the domain resolves.

## 6. After this, the agent workflow takes over

From this point on, all work happens through PRs. Branches:

- `dev` — RC-0, deployed to a Vercel preview
- `preprod` — staging, deployed to a Vercel preview with the preprod env set
- `main` — production, deployed to the Vercel production environment

The agent (`@claude` via the deutschfit polyrepo workflow) can merge PRs to
`dev`. Promotions `dev → preprod` and `preprod → main` require
`@jordanmoyo`.
