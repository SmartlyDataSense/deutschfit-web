import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Onboarding GATE e2e — proves an un-onboarded user is redirected from
 * `/fr/app` into `/fr/app/onboarding`.
 *
 * qa1 cannot test this: its `onboarded_at` is set and
 * `user_diagnostic_answers` is append-only (select-own-only RLS — no
 * client can delete rows), so once an account submits a diagnostic the
 * legacy fallback keeps it onboarded forever. This spec therefore uses a
 * SECOND, never-diagnosed account supplied via env:
 *
 *   E2E_ONBOARDING_GATE_EMAIL=<gate-account-email> \
 *   E2E_ONBOARDING_GATE_PASSWORD=<gate-account-password> \
 *   npm run e2e -- learner-onboarding-gate
 *
 * (Operator creates the account once in the dev project's Auth dashboard,
 * with a user_profiles row and NO diagnostic submissions. qa2@df.dev was
 * the original candidate but is burned — it already has legacy
 * `user_diagnostic_answers` rows, so the gate treats it as onboarded no
 * matter how many times `onboarded_at` is reset; dev now uses a fresh
 * account instead, wired via the env vars below — see `.env.local`.)
 * beforeAll re-arms the account by nulling `onboarded_at` via its own
 * RLS-scoped update. The browser test asserts the redirect only and NEVER
 * completes the wizard, so the account stays reusable. Skips (loudly) when
 * env vars are missing or the account is burned.
 */
const EMAIL = process.env.E2E_ONBOARDING_GATE_EMAIL;
const PASSWORD = process.env.E2E_ONBOARDING_GATE_PASSWORD;

function envLocal(name: string): string {
  const raw = readFileSync(resolve(__dirname, "../../.env.local"), "utf8");
  const m = raw.match(new RegExp(`^${name}=(.*)$`, "m"));
  if (!m) throw new Error(`${name} missing from .env.local`);
  return m[1]!.trim();
}

test.describe("onboarding gate (env-driven second account)", () => {
  test.skip(
    !EMAIL || !PASSWORD,
    "Set E2E_ONBOARDING_GATE_EMAIL / E2E_ONBOARDING_GATE_PASSWORD to run the gate spec"
  );

  let admin: SupabaseClient; // anon-key client signed in AS the gate user (RLS-scoped, no service role)

  test.beforeAll(async () => {
    admin = createClient(
      envLocal("NEXT_PUBLIC_SUPABASE_URL"),
      envLocal("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
      {
        auth: { persistSession: false },
      }
    );
    const { data, error } = await admin.auth.signInWithPassword({
      email: EMAIL!,
      password: PASSWORD!,
    });
    if (error) throw new Error(`gate-account sign-in failed: ${error.message}`);
    const userId = data.user!.id;

    // Burned-account guard: the legacy gate check treats ANY diagnostic
    // submission as "onboarded" — resetting onboarded_at can't undo that.
    const { count } = await admin
      .from("user_diagnostic_answers")
      .select("attempt_id", { count: "exact", head: true })
      .eq("user_id", userId);
    test.skip(
      (count ?? 0) > 0,
      `Gate account ${EMAIL} has ${count} diagnostic submission(s) — it is burned. ` +
        "Create a fresh account (Auth dashboard) and point the env vars at it."
    );

    // Re-arm: null the stamp via the account's own RLS update permission.
    const { error: resetError } = await admin
      .from("user_profiles")
      .update({ onboarded_at: null })
      .eq("user_id", userId);
    if (resetError) throw new Error(`onboarded_at reset failed: ${resetError.message}`);
  });

  test("un-onboarded login on /fr/app redirects into the onboarding wizard", async ({ page }) => {
    await page.goto("/fr/app/login");
    await page.locator("#login-email").fill(EMAIL!);
    await page.locator("#login-password").fill(PASSWORD!);
    await page.getByTestId("login-submit").click();

    // Gate chain: local flag (absent) → onboarded_at (null) → legacy
    // diagnostic rows (none) ⇒ redirect into the wizard.
    await page.waitForURL("**/fr/app/onboarding", { timeout: 20_000 });
    await expect(page.getByTestId("onboarding-welcome-screen")).toBeVisible();
    // Never click past Welcome — completing the wizard would burn the account.
  });

  test("gate redirect also fires on deep entry to a protected sub-route", async ({ page }) => {
    await page.goto("/fr/app/login");
    await page.locator("#login-email").fill(EMAIL!);
    await page.locator("#login-password").fill(PASSWORD!);
    await page.getByTestId("login-submit").click();
    await page.waitForURL("**/fr/app/onboarding", { timeout: 20_000 });

    await page.goto("/fr/app"); // try to jump back into the shell
    await page.waitForURL("**/fr/app/onboarding", { timeout: 20_000 });
  });
});
