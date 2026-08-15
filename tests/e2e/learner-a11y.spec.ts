import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "@playwright/test";

/**
 * S13 Task 10 — axe (wcag2a/wcag2aa) sweep over every reachable learner
 * route. Runs against the real dev backend (same precedent as every other
 * `learner-*.spec.ts`: seeded QA account, production build server).
 *
 * Navigation-only: every route below renders on GETs alone. ZERO metered
 * POSTs (sprechen/dialogue/ai-coach/consume-trial untouched). Excluded and why:
 *   - /app/examen/lesen/session, /hoeren/session, /sprechen/session/[topicId],
 *     /sprechen/dialogue/session, /app/schreiben/compose|feedback/[id],
 *     /sprechen/feedback/[id], /coach/correction/[modality]/[id],
 *     /srs/reveal/[cardId] — need live run/seeded state or consume quota.
 *   - /app/drill/session, /app/apprendre/practice/[modality],
 *     /app/apprendre/practice/[modality]/session — session state / dynamic param.
 *   - /app/dev/gallery — dev-only (own spec, e2e:gallery).
 *   - /app/onboarding/{result,motivation,schedule} — need wizard state; the
 *     entry screens below cover the wizard's chrome.
 *
 * `/fr/app/onboarding/diagnostic` fires the real (unmetered, non-destructive)
 * pack fetch — established S3 precedent (see `learner-onboarding.spec.ts`) —
 * and this spec must NOT click validate/answer/continue on it.
 */
const TEST_EMAIL = "qa1@df.dev";
const TEST_PASSWORD = "test1234567890";

const ROUTES = [
  "/fr/app",
  "/fr/app/history",
  "/fr/app/exam-date",
  "/fr/app/apprendre",
  "/fr/app/apprendre/practice",
  "/fr/app/schreiben",
  "/fr/app/schreiben/new",
  "/fr/app/sprechen",
  "/fr/app/sprechen/new",
  "/fr/app/sprechen/dialogue",
  "/fr/app/sprechen/dialogue/feedback", // renders the practice-score empty state
  "/fr/app/srs",
  "/fr/app/examen",
  "/fr/app/examen/modelltests",
  "/fr/app/examen/lesen",
  "/fr/app/examen/hoeren",
  "/fr/app/examen/simulation",
  "/fr/app/examen/simulation/results",
  "/fr/app/hoeren/results",
  "/fr/app/examen/lesen/results",
  "/fr/app/coach",
  "/fr/app/coach/chat",
  "/fr/app/coach/correction",
  "/fr/app/coach/drill-chain",
  "/fr/app/drill/skills",
  "/fr/app/profil",
  "/fr/app/profil/settings",
  "/fr/app/profil/settings/exam-selector",
  "/fr/app/profil/settings/exam-track",
  "/fr/app/profil/settings/objectives",
  "/fr/app/profil/delete-account",
  "/fr/app/onboarding",
  "/fr/app/onboarding/exam-type",
  "/fr/app/onboarding/diagnostic",
];

// Starts empty — an entry may only be added together with a filed issue
// number (enforced by the assertion below, matching the runtime shape the
// brief specifies: `web#123` / `backend#123` / `mobile#123`).
const KNOWN_VIOLATIONS: Array<{
  route: string;
  ruleId: string;
  issue: string;
  reason: string;
}> = [
  // AppButton `solid` variant / Chip `selected` state both render their
  // label with tone="inverse" (text-on-premium, near-white) on top of the
  // vivid bg-cta orange background. This is a byte-identical port of
  // deutschfit-mobile's own pattern — mobile's contrast.test.ts already
  // documents "onCta on cta passes AA-large only, fails AA body". The real
  // fix requires darkening the shared bg-cta background itself (used
  // app-wide for the primary CTA color, mobile + web) — a cross-platform,
  // visible design-language change out of scope for this hardening-only
  // sweep. See web#50.
  {
    route: "/fr/app/schreiben",
    ruleId: "color-contrast",
    issue: "web#50",
    reason: "AppButton solid onCta label text — see web#50",
  },
  {
    route: "/fr/app/schreiben/new",
    ruleId: "color-contrast",
    issue: "web#50",
    reason: "Chip selected onCta label text — see web#50",
  },
  {
    route: "/fr/app/sprechen",
    ruleId: "color-contrast",
    issue: "web#50",
    reason: "Chip selected onCta label text — see web#50",
  },
  {
    route: "/fr/app/sprechen/new",
    ruleId: "color-contrast",
    issue: "web#50",
    reason: "Chip selected onCta label text — see web#50",
  },
  {
    route: "/fr/app/examen/modelltests",
    ruleId: "color-contrast",
    issue: "web#50",
    reason: "AppButton solid onCta label text — see web#50",
  },
  {
    route: "/fr/app/examen/hoeren",
    ruleId: "color-contrast",
    issue: "web#50",
    reason: "AppButton solid onCta label text — see web#50",
  },
  {
    route: "/fr/app/drill/skills",
    ruleId: "color-contrast",
    issue: "web#50",
    reason: "AppButton solid onCta label text — see web#50",
  },
  {
    route: "/fr/app/onboarding",
    ruleId: "color-contrast",
    issue: "web#50",
    reason: "AppButton solid onCta label text — see web#50",
  },
  {
    route: "/fr/app/onboarding/exam-type",
    ruleId: "color-contrast",
    issue: "web#50",
    reason: "AppButton solid onCta 'Continuer' label text — see web#50",
  },
];

for (const entry of KNOWN_VIOLATIONS) {
  if (!/^(web|backend|mobile)#\d+$/.test(entry.issue)) {
    throw new Error(
      `KNOWN_VIOLATIONS entry for ${entry.route}/${entry.ruleId} has a malformed issue ` +
        `reference "${entry.issue}" — must match /^(web|backend|mobile)#\\d+$/.`
    );
  }
}

async function login(page: Page): Promise<void> {
  await page.goto("/fr/app/login");
  await page.locator("#login-email").fill(TEST_EMAIL);
  await page.locator("#login-password").fill(TEST_PASSWORD);
  await page.getByTestId("login-submit").click();
  await page.waitForURL("**/fr/app", { timeout: 15_000 });
}

async function axeCheck(page: Page, route: string): Promise<void> {
  await page.goto(route);
  await page.waitForLoadState("networkidle");
  // A route may redirect (e.g. onboarding gate for an onboarded account) —
  // axe whatever actually rendered and log the landing URL, loudly.
  const landed = new URL(page.url()).pathname;
  if (landed !== route) {
    console.log(`[learner-a11y] ${route} redirected to ${landed}`);
  }
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const serious = results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .filter((v) => !KNOWN_VIOLATIONS.some((k) => k.route === route && k.ruleId === v.id));
  expect(
    serious,
    `${route} (landed ${landed}): ${serious.map((v) => `${v.id}: ${v.nodes[0]?.html}`).join("\n")}`
  ).toEqual([]);
}

test.describe.serial("learner a11y — axe wcag2a/aa sweep (qa1, dev backend)", () => {
  test.beforeAll(() => {
    test.setTimeout(300_000);
  });

  let page: Page;

  test.beforeAll(async ({ browser }) => {
    // A page from `context.newPage()` (not `browser.newPage()`, which stamps
    // an owner-page on the context) — @axe-core/playwright's `finishRun`
    // opens its own scratch page via `page.context().newPage()`, and that
    // throws "Please use browser.newContext()" against an owned context.
    const context = await browser.newContext();
    page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);
  });

  test.afterAll(async () => {
    await page.context().close();
  });

  for (const route of ROUTES) {
    test(`${route} (desktop 1440x900): no serious/critical wcag2a/aa violations`, async () => {
      await axeCheck(page, route);
    });
  }

  test("/fr/app (mobile 390x844, TabBar chrome): no serious/critical wcag2a/aa violations", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await axeCheck(page, "/fr/app");
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test("/fr/app/apprendre (mobile 390x844, TabBar chrome): no serious/critical wcag2a/aa violations", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await axeCheck(page, "/fr/app/apprendre");
    await page.setViewportSize({ width: 1440, height: 900 });
  });
});

test.describe("learner a11y — unauthenticated login screen", () => {
  test("/fr/app/login (fresh context): no serious/critical wcag2a/aa violations", async ({
    page,
  }) => {
    await axeCheck(page, "/fr/app/login");
  });
});
