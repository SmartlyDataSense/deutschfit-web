# Learner app — promotion checklist (dev → preprod → main)

Every item below is an `@jordanmoyo`-only action (Vercel/Supabase/Fly
project owner, or the `preprod`/`main` merge authority). Claude does not
have credentials for any of these consoles and cannot execute them —
this list exists so the operator has one place to work through before the
learner app goes live at `deutschfit.app`.

## 1. Vercel env split — Production vs Preview/dev-branch

The learner app inlines several `NEXT_PUBLIC_*` vars at **build time** —
they must be set correctly in Vercel **before** the promoting build runs,
not after (S12 gate; a build with the wrong value baked in has to be
rebuilt, not just redeployed).

Variables needing distinct Production vs Preview (dev-branch) values:

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — prod
  Supabase project vs dev project (`ocqoqnifzlkrgcyjljpl`).
- `NEXT_PUBLIC_SITE_URL` — `https://deutschfit.app` vs the dev-branch URL.
- `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST` — separate
  PostHog project/key per environment (don't mix prod and dev analytics).
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — must match the `VAPID_PRIVATE_KEY` set
  as a Supabase function secret on the _same_ project (see item 6).

**Verify:** in Vercel, Project Settings → Environment Variables, confirm
each var above has a Production value and a Preview value that differ
where they should (Supabase URL/key, site URL) — then trigger a fresh
Production build and confirm (via browser devtools → Network, or
`view-source`) that the deployed bundle references the prod Supabase host,
not the dev one.

## 2. Supabase prod auth config

- Add `https://deutschfit.app` (and any preview origins actually used) to
  the prod Supabase project's allowed origins and redirect URLs.
- If OTP sign-in mode ships, enable the OTP origin allowlist — this closes
  the S1 waiver that shipped without it.

**Verify:** attempt a magic-link / OTP sign-in against prod from
`https://deutschfit.app` and confirm the callback redirects correctly
(no "redirect URL not allowed" error from Supabase Auth).

## 3. Prod gateway preflight

Re-run `scripts/spike-cors-preflight.mjs` against the **prod** Supabase
project before the first prod smoke test:

```bash
SUPABASE_URL=<prod-url> SUPABASE_ANON_KEY=<prod-anon-key> \
  QA_EMAIL=<prod-test-account> QA_PASSWORD=<...> \
  node scripts/spike-cors-preflight.mjs
```

Dev's verdict was "ES256-tolerant, no config change needed"
(`verify_jwt=true` functions accept ES256 user JWTs through the gateway
preflight without issue). Confirm prod matches — a mismatch here would
manifest as CORS/401 failures the moment the learner app hits any
`verify_jwt=true` edge function on prod.

**Verify:** script exits 0 with the same "ES256-tolerant" verdict as the
dev run. If it doesn't, do not proceed to prod launch — file a backend
issue first.

## 4. `dev.deutschfit.app` DNS

Wire `dev.deutschfit.app` → the Vercel `dev` branch deployment, per
[`vercel-dev-branch.md`](vercel-dev-branch.md) (DNS is managed at
Cloudflare, not Vercel's own DNS panel — see that doc's "Current
nameservers" note).

**Verify:** `https://dev.deutschfit.app` resolves and serves the latest
`dev`-branch deploy without a Vercel SSO prompt.

## 5. Fly / KIConnect secrets — unblocks `ai-coach`

`ai-coach` 502s on dev today, tracked in **backend#420**. The remediation
already shipped as code in **backend#425** (merged) — a swappable chat
provider (`LLM_CHAT_BASE_URL` / `LLM_CHAT_API_KEY` / `LLM_CHAT_MODEL`,
all unset by default = plain OpenAI). What's still needed is operational:
`flyctl auth login`, then set the chat-provider secrets on the Fly app
running `services/ai`. Until that's done, `ai-coach` keeps 502ing
regardless of the code fix already being live.

Once secrets are set:

- The Betreuer chat e2e leg (`learner-coach.spec.ts`) should hit its 200
  success branch instead of the loud-skip-on-502 path.
- S12's outstanding manual verification — "one real delivered push"
  (Betreuer reply → service-worker notification, real Chrome with GCM
  flags, deliberately excluded from the automated suite because Playwright
  flags kill Chrome's push delivery) — becomes runnable end-to-end.

**Verify:** trigger one `ai-coach` call (e.g. via the e2e suite's single
metered POST, or manually as `qa1@df.dev`) and confirm 200, not 502.

## 6. VAPID keys on prod

Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` as Supabase
function secrets on the **prod** project (see
`deutschfit-backend/scripts/generate-vapid-keys.ts` for how the dev keys
were generated). By design (S12), the notifications feature stays dark —
renders as "not available", never crashes — until this is set. Pair with
item 1's `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (must be the public half of the
same key pair).

**Verify:** `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is set in Vercel Production and
matches the prod `VAPID_PUBLIC_KEY` secret; the in-app push opt-in no
longer renders "not available" for a prod build.

## 7. Known blockers at promotion time

Re-check each before or immediately after promoting — none of these block
promotion outright, but each is a known gap a user can hit live:

| Issue                                                                            | User-visible impact                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [backend#414](https://github.com/SmartlyDataSense/deutschfit-backend/issues/414) | No published Lesen Modelltest rows on dev (only Hören has real published content). The graded full-exam Lesen simulation track is empty for every board/level — content gap, not a code bug.                                                                                                                                                                      |
| [backend#415](https://github.com/SmartlyDataSense/deutschfit-backend/issues/415) | Every Schreiben submission on dev ends in the `failed` state (`grader_http_500` from the AI grader service). Writing feedback is unusable on dev until the grader-side regression (opened 2026-07-19) is fixed.                                                                                                                                                   |
| [backend#417](https://github.com/SmartlyDataSense/deutschfit-backend/issues/417) | Sprechen recording upload from the web app fails 100% of the time: the edge function hardcodes a `.m4a` storage path/content-type (mobile-only assumption), but the web recorder produces `audio/webm`. Sprechen is end-to-end unusable from web until this is fixed.                                                                                             |
| [backend#418](https://github.com/SmartlyDataSense/deutschfit-backend/issues/418) | The 4-skill mock-exam chain dead-ends after Hören: `NEXT_MODULE.SCHREIBEN` is `null` and no code path writes the Schreiben/Sprechen submission-id links, so a full Schreiben or Sprechen leg of a mock exam can never be graded. Web ships an honest skip; mobile silently dead-ends.                                                                             |
| [web#32](https://github.com/SmartlyDataSense/deutschfit-web/issues/32)           | Picking a Hören-only Modelltest from the Simulation list still launches the full 4-module exam and starts on Lesen — landing on an empty "Keine Aufgaben in dieser Sitzung" page with no exit CTA, and locks a stuck `in_progress` attempt (subsequent tries 409-resume to the same dead end).                                                                    |
| [web#50](https://github.com/SmartlyDataSense/deutschfit-web/issues/50)           | `AppButton`'s solid variant and `Chip`'s selected state render white/near-white label text on the `bg-cta` orange background, which fails WCAG AA body-text contrast (passes AA-large only) — confirmed by the S13 axe sweep on 8+ routes (Schreiben, Sprechen, Examen, Drill, Onboarding). Ported byte-identical from mobile, which has the same documented gap. |

## 8. Promotion ladder + post-promotion smoke

`dev → preprod → main` stays `@jordanmoyo`-only for the `preprod`/`main`
merges (Claude's merge authority is `dev`-only). After promoting a build to
`preprod` or `main`, run this smoke list against the promoted deployment:

- [ ] Log in as a real (or `qa1`-equivalent) test account.
- [ ] `/app` (accueil) hydrates — home screen renders real user state, not
      a stuck loading skeleton.
- [ ] Complete one graded loop end-to-end (e.g. an untimed practice quiz,
      picker → session → answer → results).
- [ ] Push round-trip: opt in to notifications, trigger one push (e.g. via
      the Betreuer chat once item 5 is resolved), confirm delivery.
- [ ] `npm run check:bundle` against the promoted build's `.next/` output —
      confirm every `(learner)` route is still within budget on the real
      production bundle, not just the last dev build.
