# deutschfit-web

Next.js 15 / React 19 app serving three surfaces under one deployment:

- **Marketing + legal** (public) — `src/app/[locale]/(public)/`, including
  `/legal/*` (about, impressum, privacy, refund, tos) and `/account/*`
  (login, auth callback).
- **Admin back-office** — `src/app/[locale]/(admin)/admin/*` (audit, auth,
  login, plans, subscriptions, users).
- **Learner app** — `src/app/[locale]/(learner)/app/*`, feature code under
  `src/learner/` (see [`src/learner/README.md`](src/learner/README.md) for
  the module map). Ported from `deutschfit-mobile`, connected directly to
  the same Supabase backend (edge functions + PostgREST + Storage), with
  Dexie/IndexedDB standing in for expo-sqlite. Spec:
  [`../deutschfit-meta/docs/superpowers/specs/2026-08-08-web-learner-app-design.md`](../deutschfit-meta/docs/superpowers/specs/2026-08-08-web-learner-app-design.md).
  Master implementation plan:
  [`../deutschfit-meta/docs/superpowers/plans/2026-08-08-web-learner-app-master.md`](../deutschfit-meta/docs/superpowers/plans/2026-08-08-web-learner-app-master.md).

There is also a top-level `src/app/auth/*` bridge (`confirm`, `confirmed`,
`error`, `reset-password`) shared by the public and learner auth flows —
never modify it from a learner-scoped change.

## Quickstart

```bash
npm install
cp .env.local.example .env.local   # fill in real values, see below
npm run dev                        # http://localhost:3000
```

`.env.local.example` documents every variable inline. For local learner-app
development, the Supabase URL/anon-key pair is the **dev** project
(`ocqoqnifzlkrgcyjljpl`) — copy the values from `deutschfit-backend/.env.local`
(sibling repo). Never put the service-role key here; it must never be set
with a `NEXT_PUBLIC_*` prefix and must never appear in learner code or a
client bundle.

## Scripts

| Script                            | Does                                                                                                        |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `npm run dev`                     | `next dev --turbopack`                                                                                      |
| `npm run build`                   | `next build --turbopack`                                                                                    |
| `npm run start`                   | `next start` (serves the production build)                                                                  |
| `npm run lint`                    | `eslint`                                                                                                    |
| `npm run typecheck`               | `tsc --noEmit`                                                                                              |
| `npm run format` / `format:check` | Prettier over `src/**`, root `*.{ts,mjs,json,md}`, `tests/**`, `scripts/**` — see note below                |
| `npm run test` / `test:run`       | Vitest (watch / single run)                                                                                 |
| `npm run e2e`                     | `playwright test` (all specs, real dev backend — see below)                                                 |
| `npm run e2e:gallery`             | Component gallery spec only, gated behind `NEXT_PUBLIC_ENABLE_GALLERY=1`                                    |
| `npm run types:sync`              | Copies the canonical generated Supabase types from `deutschfit-backend` into `src/shared/database.types.ts` |
| `npm run check:bundle`            | Bundle-budget guard for `(learner)` routes — see below                                                      |
| `npm run preflight`               | `typecheck && lint && format:check && test:run && build && check:bundle` — the merge bar                    |

**Prettier glob note:** `format`/`format:check` cover `src/**/*.{ts,tsx,json,md,css}`
(which includes `src/learner/README.md` and any `.md` file anywhere under
`src/`), root `*.{ts,mjs,json,md}` (covers `README.md`, `CLAUDE.md`),
`tests/**/*.{ts,tsx}`, and `scripts/**/*.{mjs,ts}`. `docs/**` is **not**
covered by any glob — files there (including
`docs/deployment/learner-promotion-checklist.md`) are formatted by hand,
consistently with their neighbours.

## Testing

**Unit** — `npm run test:run` (Vitest). Includes
`tests/unit/learner-source-scan.test.ts`, which statically scans every file
under `src/learner/**` for hex-color / raw font-size / spacing literals.

**E2E** — Playwright, `tests/e2e/*.spec.ts`. Read this before running it:

- **Non-hermetic.** The suite runs against the **real dev Supabase project**
  (`ocqoqnifzlkrgcyjljpl`), not a mock or local stack. There is no seed/reset
  step — specs are written to tolerate whatever state the dev project is
  currently in.
- Recommended invocation: `PLAYWRIGHT_PORT=3100 npx playwright test --workers=1`
  (a dedicated port avoids colliding with a dev server already running on
  3000; single-worker keeps quota-metered specs from racing each other).
- **Quotas on dev are real and shared.** Metered actions this suite can
  trigger: Sprechen submissions (10/24h — spec `(d)` fires exactly one,
  never retried, and treats a `429` as a pass), the Sprechen dialogue leg
  (2/24h — the suite fires **zero** dialogue starts by design), and
  `ai-coach` (30/24h RPC cap — exactly **one** `POST` per full suite run,
  in `learner-coach.spec.ts`). Because of this, **run the full suite once
  per evidence pass, not on every commit.**
- `qa1@df.dev` (password `test1234567890`) is the shared test account. It
  must **never** be deleted. `tests/e2e/learner-profil.spec.ts` counts every
  `/account-delete` request across the file and asserts zero in an
  `afterEach` for every test — the account-deletion leg types `DELETE` into
  the confirm field, asserts the CTA becomes enabled, and stops, never
  clicking it.
- Credentials for `qa1` (and the onboarding-gate test account, via
  `E2E_ONBOARDING_GATE_EMAIL`/`_PASSWORD`) are inline in the specs by repo
  convention — e2e is local-only and never runs in CI, so this is not a
  committed-secret risk the way it would be in a CI-run suite.

## Bundle budget

`npm run check:bundle` (`scripts/check-bundle-budget.mjs`) reads
`.next/app-build-manifest.json` after a build, and for every `(learner)`
route sums the **gzip level-9** byte size (KiB) of that route's listed JS
files. This is a deliberately different metric from the number `next build`
prints in its own build-output table (different aggregation). **The guard is
internally consistent — its numbers are only ever compared against itself
and against the budgets below, never against Next's summary.** A gap between
the two is expected, not a bug: during S13 the app-shell route measured
371.9 KB gz by this guard where Next's table printed 381 KB for the same
route. Budgets: the bare `(protected)/page` app-shell route
≤ 300 KB gz; every other `(learner)` route ≤ 320 KB gz. The guard also
prints a chunk-attribution table for the app-shell route (which dependency —
posthog, dexie, i18next, supabase — landed in which chunk).

The guard runs as the last step of `npm run preflight` and in CI
(`.github/workflows/ci.yml`, "Bundle budget" step, after `next build`).

## Deployment

See [`docs/deployment/`](docs/deployment/):

- [`vercel-dev-branch.md`](docs/deployment/vercel-dev-branch.md) — Vercel
  project audit + `dev` branch → `dev.deutschfit.app` wiring plan.
- [`env-var-update-2026-05-28.md`](docs/deployment/env-var-update-2026-05-28.md) —
  env-var change log.
- [`learner-promotion-checklist.md`](docs/deployment/learner-promotion-checklist.md) —
  the remaining `@jordanmoyo`-only steps to promote the learner app from dev
  to prod.
- [`docs/spike-cors-preflight.md`](docs/spike-cors-preflight.md) —
  write-up for `scripts/spike-cors-preflight.mjs`, the gateway
  CORS/ES256-tolerance probe.

Promotion ladder is `dev → preprod → main`, `@jordanmoyo`-only for
`preprod`/`main` merges (Claude merges `dev` PRs).
