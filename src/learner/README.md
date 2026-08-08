# Learner Module

The learner module contains the feature tree for the DeutschFit web learner application (S0 foundation and beyond).

## Module Map

```
src/learner/
├── core/              # Shared state, hooks, utilities (Zustand stores, constants)
├── ui/                # Reusable UI components (buttons, cards, inputs, etc.)
├── accueil/           # Landing/home screen
├── onboarding/        # User onboarding flow
├── practice/          # Practice session orchestration
├── lesen/             # Reading (Lesen) skill module
├── hoeren/            # Listening (Hören) skill module
├── schreiben/         # Writing (Schreiben) skill module
├── sprechen/          # Speaking (Sprechen) skill module
├── coach/             # Coach / Betreuer interactions
├── drill/             # Drill functionality
├── srs/               # Spaced repetition system
├── exam/              # Exam preparation and practice
├── profil/            # User profile management
├── settings/          # App settings and preferences
├── history/           # Learning history and progress
└── readiness/         # Readiness checks and diagnostics
```

## Hard Rules

### Design Tokens Only

- **No hex color literals** — use CSS variables from the theme system (e.g., `var(--color-cream)`)
- **No font-size or spacing literals** — use token variables only
- All styling must route through tokens defined in `/src/theme/`

### Approved Dependencies

The following dependencies **ONLY** are approved for use:

- `zustand` — state management
- `i18next` — i18n infrastructure (must use `react-i18next`)
- `react-i18next` — React bindings for i18next
- `posthog-js` — analytics
- `dexie` — IndexedDB abstraction
- Existing: `next`, `react`, `react-dom`, `zod`, `@supabase/*`, `clsx`, `resend`, `next-intl`

**No other third-party packages without explicit approval.**

### i18n Convention

- Default language: **French (FR)**
- All user-facing strings must be keyed and translated
- Use `react-i18next` via `useTranslation()` hook or HOC

### Icons

- Icons must come from the **ported DeutschFit icon sprite only**
- No external icon libraries (Material Icons, Feather, etc.)
- If an icon is missing, file a request before inventing glyphs

### No External UI Libraries

- Every component lives in this module (learner)
- Do not import from `@smartlydatasense/deutschfit-ui` or any external UI library
- Build all primitives locally in `ui/`

## Module Responsibilities

| Module                                 | Responsibility                                                |
| -------------------------------------- | ------------------------------------------------------------- |
| **core**                               | Zustand stores, app-wide constants, utility functions, hooks  |
| **ui**                                 | Reusable components: Button, Card, Input, Modal, etc.         |
| **accueil**                            | Home screen, dashboard, navigation entry point                |
| **onboarding**                         | Level selection, profile setup, initial configuration         |
| **practice**                           | Session orchestration, quiz flow, feedback rendering          |
| **lesen, hoeren, schreiben, sprechen** | Skill-specific logic and UI (can be integrated into practice) |
| **coach**                              | Betreuer persona interactions, feedback, hints                |
| **drill**                              | Vocabulary drill and micro-practice sessions                  |
| **srs**                                | Spaced repetition scheduling and tracking                     |
| **exam**                               | Exam-mode practice, cert-aligned content                      |
| **profil**                             | User profile view, stats, achievements                        |
| **settings**                           | App preferences, language selection, account settings         |
| **history**                            | Learning history, progress analytics, session review          |
| **readiness**                          | Diagnostic checks, level readiness assessment                 |
