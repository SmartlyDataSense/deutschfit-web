# Learner Module

The learner module is the feature tree for the DeutschFit web learner
application, rendered at `src/app/[locale]/(learner)/app/*`. **Mobile
(`deutschfit-mobile`) is the source of truth — port, don't invent.** Any
screen, event, or business rule here should trace back to a mobile
equivalent; if a web-only need arises, it goes through review as a
deliberate, documented deviation (see e.g. the `resetAnalyticsUser`/EN-fallback
notes below), not a silent addition.

## Module Map

16 feature directories, plus `core` (shared state/hooks/utilities),
`ui` (reusable components), and `locales` (i18n catalogs — see below):

```
src/learner/
├── core/               # Zustand stores, i18n, analytics, db, api clients, hooks
├── ui/                 # Reusable UI components (buttons, cards, nav, inputs, etc.)
├── locales/             # fr/en i18next catalogs, one JSON per namespace
├── account-deletion/    # In-app account deletion flow
├── accueil/             # Landing/home screen
├── coach/                # Betreuer persona interactions, feedback, hints
├── drill/                # Vocabulary drill and micro-practice sessions
├── exam/                 # Exam-mode practice, cert-aligned content, simulations
├── history/              # Learning history, progress review
├── hoeren/               # Listening (Hören) skill module
├── lesen/                # Reading (Lesen) skill module
├── onboarding/           # User onboarding flow
├── practice/             # Untimed practice session orchestration
├── profil/               # User profile view, stats
├── readiness/            # Diagnostic checks, level readiness assessment
├── schreiben/             # Writing (Schreiben) skill module, incl. handwritten capture
├── settings/              # App preferences, language selection, notifications
├── sprechen/               # Speaking (Sprechen) skill module, incl. dialogue
└── srs/                   # Spaced repetition scheduling and tracking
```

| Module                                 | Responsibility                                                                           |
| -------------------------------------- | ---------------------------------------------------------------------------------------- |
| **core**                               | Zustand stores, i18n instance, analytics client, Dexie db, API clients, hooks, constants |
| **ui**                                 | Reusable components: Button, Card, Input, nav, icons                                     |
| **account-deletion**                   | In-app account deletion (confirm-typed-DELETE gate)                                      |
| **accueil**                            | Home screen, dashboard, navigation entry point                                           |
| **coach**                              | Betreuer persona interactions: chat, observations, drill chains                          |
| **drill**                              | Vocabulary drill and micro-practice sessions                                             |
| **exam**                               | Exam-mode practice, cert-aligned content, full/module simulations                        |
| **history**                            | Learning history, progress review per module                                             |
| **hoeren, lesen, schreiben, sprechen** | Skill-specific logic and UI                                                              |
| **onboarding**                         | Level selection, profile setup, initial configuration                                    |
| **practice**                           | Untimed practice session orchestration, quiz flow, feedback rendering                    |
| **profil**                             | User profile view, stats                                                                 |
| **readiness**                          | Diagnostic checks, level readiness assessment                                            |
| **settings**                           | App preferences, language selection, notifications toggle                                |
| **srs**                                | Spaced repetition scheduling and tracking                                                |

## Lazy-load seams (S13)

Two dependencies moved from a top-level `import` to a lazy `import()` this
slice, to keep them out of every learner route's first-load bundle. Both
carry a load-bearing invariant — **do not remove the comment marking it in
the source, and do not remove the code it's attached to.**

### `core/analytics/posthog.ts` — `posthog-js`

`posthog-js` (~76 kB gz) is now loaded via a single shared `loadPromise`
inside `loadClient()`, kicked off the first time any export
(`initPostHog`, `trackEvent`, `identifyUser`, `resetAnalyticsUser`) is
called. **Invariant: `resetAnalyticsUser()` must funnel through this same
`loadClient()` promise, never early-return on a null client.** If sign-out
calls `resetAnalyticsUser()` while the chunk is still loading and it
early-returns, a queued `identifyUser()` call can land _after_ the reset —
leaving a signed-out shared device still identified as the previous user.

### `core/i18n/index.ts` — EN fallback catalogs

`fr` (the default boot language) is bundled statically for synchronous
`t()` resolution. The 17 `en` fallback catalogs are dynamically
`import()`ed and registered via `addResourceBundle()` in `whenEnReady()`,
kicked off in the background at the end of `initLearnerI18n()`.
**Invariant: the `learnerI18n.emit("languageChanged", …)` call at the end
of `whenEnReady()`'s promise must not be deleted.** `react-i18next`'s
`useTranslation()` defaults to `bindI18nStore: ''`, so it does **not**
re-render on the `'added'` event `addResourceBundle` emits. Without the
explicit `emit`, any component that rendered before the EN catalogs
finished loading — a missing `fr` key falling through to a not-yet-loaded
`en`, or `changeLanguage("en")` firing before `whenEnReady()` settles — is
stuck showing the raw i18next key forever, even after the bundle lands.

## i18n

- Dedicated `i18next` instance (`learnerI18n`, `core/i18n/index.ts`) via
  `i18next.createInstance()` — never the global i18next/next-intl singleton
  the marketing/admin surfaces use.
- **17 namespaces**: `apprendre`, `auth`, `coach`, `common`, `dashboard`,
  `drill`, `exam`, `examen`, `notifications`, `onboarding`, `profil`,
  `schreiben`, `settings`, `simulation`, `sprechen`, `srs`, `writing`.
  16 are copied verbatim from `deutschfit-mobile`'s `src/locales/{fr,en}/*.json`;
  `notifications` (S12, web push) is the one exception — authored here
  (French first, mirrored to English) because web push has no mobile
  counterpart.
- Language resolution the module supports (`core/i18n/index.ts`,
  `resolveInitialLng`): explicit override → `localStorage["@deutschfit/lang"]`
  → `"fr"` default. Never derived from `navigator.language`. This is
  mobile-parity module capability, not what actually happens on the web
  surface — see below.
- **On web, only the override branch is ever reached.** `LearnerProviders`
  (`core/LearnerProviders.tsx`) always calls `initLearnerI18n(useLocale())`,
  and `useLocale()` — under `localePrefix: "always"` (`src/i18n/routing.ts`)
  — is always `"en"` or `"fr"` from the URL segment, never `undefined`. So
  the `localStorage` branch and the `"fr"` default are dead code paths on
  this surface: there is no "FR default" on web. `defaultLocale: "en"`
  means a visitor whose browser doesn't negotiate to `/fr` lands on `/en`.
  `en` is the fallback language for keys missing from whichever catalog
  actually booted, independent of which language that was.

## Dexie (IndexedDB)

`core/db/schema.ts` defines an 11-table Dexie schema (`deutschfit-learner`,
version 1), mirroring `deutschfit-mobile`'s Drizzle schemas so the web app
persists the same shapes offline that mobile does. Table names are
camelCase; row field names stay `snake_case` to mirror mobile 1:1.

Tables: `writingDrafts`, `srsCards`, `srsReviews`, `contentCache`,
`userStats`, `mockExamCache`, `cachedTopics`, `activeSubmission`,
`drillSessions`, `drillAttemptOutbox`, `practiceProgress`.

## Hard Rules

### Design Tokens Only

- No hex color literals — use CSS variables from the theme system
  (`src/theme/tokens.ts`, `globals.css`).
- No font-size or spacing literals — use token variables only.
- Enforced by `tests/unit/learner-source-scan.test.ts` (a static scan over
  every file under `src/learner/**`, part of `npm run test:run`). A small,
  verified allowlist exists for confirmed mobile-parity pixel values —
  don't add to it without matching that rigor.

### Approved Dependencies

The following are approved for use in `src/learner/**`:

- `zustand` — state management
- `i18next` + `react-i18next` — i18n infrastructure
- `posthog-js` — analytics
- `dexie` — IndexedDB abstraction
- Existing app-wide deps: `next`, `react`, `react-dom`, `zod`,
  `@supabase/ssr`, `@supabase/supabase-js`, `clsx`, `resend`, `next-intl`

**No other third-party runtime dependency without explicit sign-off first.**

### Icons

- Icons come from the ported DeutschFit icon sprite
  (`core/icons/iconSprite.tsx`) plus 5 inlined Ionicons outline glyphs
  (`core/icons/ionicons.tsx`): `chatbubbleOutline`, `bulbOutline`,
  `micOutline`, `sparklesOutline`, `documentTextOutline`.
- No external icon libraries. If a needed icon is missing from both sets,
  file a request before inventing a glyph.

### No External UI Libraries

- Every component lives in this module.
- Never import from `@smartlydatasense/deutschfit-ui` or any other external
  UI library — build primitives locally in `ui/`.
