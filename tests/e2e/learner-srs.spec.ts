import { test, expect, type Page } from "@playwright/test";

// S10 SRS e2e — REAL dev backend for auth only. SRS itself is 100% LOCAL
// (IndexedDB) — no edge function, no PostgREST, no quota. There is no
// production card producer on either platform yet, so the empty state is
// the true default; the review-loop leg seeds `srsCards` directly via
// page.evaluate (raw indexedDB — the Dexie DB already exists after the
// first /srs visit opens it).
//
// QUOTA BUDGET: zero metered calls. `consume-trial` and `ai-coach` are
// tracked defensively and asserted 0.
const TEST_EMAIL = "qa1@df.dev";
const TEST_PASSWORD = "test1234567890";

async function login(page: Page): Promise<void> {
  await page.goto("/fr/app/login");
  await page.locator("#login-email").fill(TEST_EMAIL);
  await page.locator("#login-password").fill(TEST_PASSWORD);
  await page.getByTestId("login-submit").click();
  await page.waitForURL("**/fr/app", { timeout: 15_000 });
}

const fileMeteredRequests = {
  consumeTrial: [] as string[],
  aiCoach: [] as string[],
};

function trackFileMeteredRequests(page: Page): void {
  page.on("request", (req) => {
    const url = req.url();
    if (url.includes("/consume-trial")) fileMeteredRequests.consumeTrial.push(url);
    if (url.includes("/ai-coach")) fileMeteredRequests.aiCoach.push(url);
  });
}

const DAY_MS = 24 * 60 * 60 * 1000;

function seedRows(now: number) {
  const mk = (
    id: string,
    overdueDays: number,
    before: string,
    after: string,
    correct: string,
    wrongs: string[],
    explanation: string
  ) => ({
    id,
    card_type: "grammar_connector",
    prompt: {
      kind: "cloze",
      subjectLabel: "Connecteurs B1",
      before,
      after,
      translation: "Je reste à la maison parce qu'il pleut.",
      explanation,
    },
    answer: {
      options: [
        { id: "o1", label: correct, isCorrect: true },
        ...wrongs.map((w, i) => ({ id: `w${i}`, label: w, isCorrect: false })),
      ],
    },
    source_ref: "e2e-seed",
    deck: null,
    next_due: now - overdueDays * DAY_MS,
    created_at: now - 10 * DAY_MS,
  });
  return [
    mk(
      "e2e-srs-card-1",
      3,
      "Ich bleibe zu Hause,",
      "es regnet.",
      "weil",
      ["obwohl", "deshalb", "denn"],
      "« weil » introduit une cause et envoie le verbe à la fin."
    ),
    mk(
      "e2e-srs-card-2",
      1,
      "Er lernt Deutsch,",
      "er nach Berlin zieht.",
      "weil",
      ["obwohl", "trotzdem", "sondern"],
      "« weil » introduit une cause et envoie le verbe à la fin."
    ),
  ];
}

async function seedSrsCards(page: Page): Promise<void> {
  await page.evaluate(async (rows) => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("deutschfit-learner");
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("srsCards", "readwrite");
        const store = tx.objectStore("srsCards");
        for (const row of rows) store.put(row);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  }, seedRows(Date.now()));
}

test.describe.serial("SRS revision loop (qa1, local IndexedDB)", () => {
  test("(a) Apprendre Révision card routes to /srs; fresh browser shows the empty state", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    trackFileMeteredRequests(page);
    await login(page);

    await page.goto("/fr/app/apprendre");
    await page.getByTestId("apprendre-card-srs").click();
    await page.waitForURL("**/fr/app/srs");
    await expect(page.getByTestId("srs-revision-empty")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("srs-revision-empty")).toContainText("Aucune carte à réviser");

    // mobile viewport smoke on the same state
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId("srs-revision-empty")).toBeVisible();
    await page.screenshot({ path: "test-results/s10-srs-empty-mobile.png", fullPage: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: "test-results/s10-srs-empty-desktop.png", fullPage: true });
  });

  test("(b) seeded deck: reveal -> rate 'Bien' x2 drains the queue back to empty; zero metered calls", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    trackFileMeteredRequests(page);
    await login(page);

    // ORDER MATTERS: `seedSrsCards` opens the DB WITHOUT a version, which
    // creates an empty store-less database if Dexie has not opened it yet —
    // `tx.objectStore("srsCards")` would then throw NotFoundError. Waiting
    // for the EMPTY STATE (not the outer container, which paints while the
    // query is still in flight) proves `getLearnerDb()` resolved and the
    // object stores exist before we seed.
    await page.goto("/fr/app/srs");
    await expect(page.getByTestId("srs-revision-empty")).toBeVisible({ timeout: 15_000 });
    await seedSrsCards(page);
    await page.reload();

    // Card 1 (most overdue first).
    await expect(page.getByTestId("srs-revision-card")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("srs-revision-footer")).toContainText("Carte 1 / 2");
    await page.screenshot({
      path: "test-results/s10-srs-revision-card-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "test-results/s10-srs-revision-card-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByTestId("srs-revision-reveal").click();
    await page.waitForURL("**/fr/app/srs/reveal/e2e-srs-card-1");
    await expect(page.getByTestId("srs-reveal-options")).toBeVisible();
    await expect(
      page.getByTestId("srs-reveal-options").locator('[role="radio"]').first()
    ).toContainText("weil ✓");
    await expect(page.getByTestId("srs-reveal-explanation")).toContainText("Pourquoi ?");
    await page.getByRole("button", { name: /Bien/ }).click();
    await page.waitForURL("**/fr/app/srs");

    // Card 2.
    await expect(page.getByTestId("srs-revision-footer")).toContainText("Carte 1 / 1", {
      timeout: 15_000,
    });
    await page.getByTestId("srs-revision-reveal").click();
    await page.waitForURL("**/fr/app/srs/reveal/e2e-srs-card-2");
    await page.getByRole("button", { name: /Bien/ }).click();
    await page.waitForURL("**/fr/app/srs");

    await expect(page.getByTestId("srs-revision-empty")).toBeVisible({ timeout: 15_000 });

    console.log(
      `[srs e2e] cumulative file totals — consume-trial: ${fileMeteredRequests.consumeTrial.length} (must be 0), ai-coach: ${fileMeteredRequests.aiCoach.length} (must be 0)`
    );
    expect(fileMeteredRequests.consumeTrial.length).toBe(0);
    expect(fileMeteredRequests.aiCoach.length).toBe(0);
  });
});
