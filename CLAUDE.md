# CLAUDE.md — `deutschfit-web`

Next.js 15 / React 19 app. Three surfaces in one deployment: **marketing +
legal** (public), **admin back-office**, **learner app**. Full context in
[`README.md`](README.md); module map + hard rules for the learner tree in
[`src/learner/README.md`](src/learner/README.md) — read that before touching
`src/learner/**`.

## Repo map

- `src/app/[locale]/(public)/` — marketing, `/legal/*`, `/account/*` (login,
  auth callback).
- `src/app/[locale]/(admin)/admin/*` — back-office.
- `src/app/[locale]/(learner)/app/*` — learner app routes; feature code
  lives in `src/learner/` (16 feature dirs + `core`/`ui`/`locales`).
- `src/app/auth/*` — top-level bridge pages (`confirm`, `confirmed`,
  `error`, `reset-password`) shared by public + learner auth flows.
- `docs/deployment/` — Vercel/DNS/env docs, including the promotion
  checklist.

## Hard locks — never violate these

- **Never modify**: `src/app/[locale]/(public)/legal/*`, the public landing
  page, anything under `(admin)`, or the `/auth/*` bridge pages. Learner
  code may _link_ to them, never edit them.
- **Never render** paywall / IAP / upgrade / premium UI anywhere in the
  learner app. Monetization is web-only and lives entirely outside the
  learner surface (`/how-to-pay`, admin plans/subscriptions).
- The Supabase **service-role key** must never appear in learner code or a
  client bundle — server-only, never `NEXT_PUBLIC_*`.
- `src/learner/**` is **tokens only**: no hex color, font-size, or spacing
  literals. Enforced by `tests/unit/learner-source-scan.test.ts` (a static
  scan, part of `test:run`). A small, verified allowlist exists for
  mobile-parity pixel values (see the test file) — don't add to it without
  the same rigor.
- Icons in the learner app come **only** from the ported sprite
  (`src/learner/core/icons/iconSprite.tsx`) plus 5 inlined Ionicons glyphs
  (`chatbubbleOutline`, `bulbOutline`, `micOutline`, `sparklesOutline`,
  `documentTextOutline` in `src/learner/core/icons/ionicons.tsx`). Never
  invent a glyph — file a request if one is missing.
- Runtime dependencies are frozen to the approved set (see
  `src/learner/README.md`'s "Approved Dependencies"). Adding any new
  runtime dependency needs fresh sign-off before it lands — don't just
  `npm install` and go.
- Learner-app i18n: the URL locale segment (`/en/...` or `/fr/...` —
  `localePrefix: "always"`, `src/i18n/routing.ts`) always drives the boot
  language. `LearnerProviders` passes `useLocale()` explicitly on every
  mount, so the i18n module's own `localStorage["@deutschfit/lang"]` →
  `"fr"` default (documented in `core/i18n/index.ts` as what the module
  supports, mirroring mobile) is never actually reached on this web
  surface — there is no "FR default" here. `defaultLocale: "en"`, so a
  visitor whose browser doesn't negotiate to `/fr` lands on `/en`, never
  `/fr`. `en` remains the fallback language for keys missing from
  whichever catalog actually booted (never derived from
  `navigator.language`). Persona is the unnamed **Betreuer** — "Coach" and
  "entraîneur" are forbidden in user-facing copy. No exclamation marks, no
  gamification vocabulary. Emoji are limited to four functional glyphs —
  `📍` (location), `⏱` (time), `✓` (done), `✕` (failed/forbidden); see
  `../deutschfit-meta/docs/product/brand-voice.md` §"Allowed (functional
  only)", which is the authority. These rules bind the
  strings the code renders, not this document — brand voice doesn't apply
  to internal engineering docs.

## Git workflow

- Branch off `dev`; PRs merge to `dev` (Claude has merge authority there).
  `preprod`/`main` promotions are `@jordanmoyo`-only — never push or merge
  to them directly.
- Never force-push.
- Stage files individually (`git add <path>`), never `git add -A`.
- Conventional Commits.

## Testing — merge bar

`npm run preflight` (`typecheck && lint && format:check && test:run &&
build && check:bundle`) must be green before any PR merges. TDD is the
default workflow: failing test → minimal implementation → pass → commit.

**E2E is non-hermetic** — it runs against the real dev Supabase project
(`ocqoqnifzlkrgcyjljpl`), no seed/reset step. Quotas are real and shared:
Sprechen submissions 10/24h, the Sprechen dialogue leg 2/24h (the suite
fires **zero** dialogue starts by design), `ai-coach` 30/24h (exactly
**one** `POST` per full suite run). Because of this, **the full suite runs
once per evidence pass, not per commit.** `qa1@df.dev` is the shared test
account and must **never** be deleted —
`tests/e2e/learner-profil.spec.ts` asserts zero `/account-delete` requests
across every test in the file. Dev-backend e2e credentials are **never** in
CI — the suite is local-only by design, and its inline `qa1` credentials
are not a committed-secret risk for that reason. Full detail:
[`README.md`](README.md#testing).

## Bundle budget

`npm run check:bundle` gzips (level 9) each `(learner)` route's JS from
`.next/app-build-manifest.json` and enforces: app-shell `(protected)/page`
≤ 300 KB gz, every other learner route ≤ 320 KB gz. It is deliberately not
the same number `next build` prints in its own summary table (different
aggregation) — the guard is internally consistent, compared only against
itself, so a gap either way is expected rather than a bug. Runs in
`preflight` and in CI.

## Read next

- [`src/learner/README.md`](src/learner/README.md) — learner module map,
  Dexie schema, i18n namespaces, the two S13 lazy-load seams and their
  invariants.
- [`docs/deployment/learner-promotion-checklist.md`](docs/deployment/learner-promotion-checklist.md) —
  what's left before the learner app can go to prod.
- `../deutschfit-meta/docs/superpowers/specs/2026-08-08-web-learner-app-design.md`
  and `../deutschfit-meta/docs/superpowers/plans/2026-08-08-web-learner-app-master.md`
  (sibling repo) — the learner app's spec and master plan.
