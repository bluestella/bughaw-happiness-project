// "setup" project: one real UI sign-in per role → storageState files the specs reuse.
import { expect, test as setup } from "@playwright/test";
import { authFile, ROLES, signIn } from "./support/auth.ts";
import { e2eEnv } from "./support/env.ts";

// Guard for the test-data rule (docs/ui-testing.md §1.1): make sure the Next.js
// server under test is wired to the LOCAL Supabase, not whatever .env.local
// points at. next.config.js only adds an http Supabase origin to the CSP when
// NEXT_PUBLIC_SUPABASE_URL is that local URL.
setup("app server uses the local Supabase", async ({ request }) => {
  const res = await request.get("/login");
  const csp = res.headers()["content-security-policy"] ?? "";
  const origin = new URL(e2eEnv().supabaseUrl).origin;
  expect(
    csp,
    `The app at ${e2eEnv().baseURL} is not using ${origin}. Stop any server on that port ` +
      "and let Playwright start one (it injects the local Supabase env)."
  ).toContain(origin);
});

for (const role of ROLES) {
  setup(`sign in as ${role}`, async ({ page }) => {
    await signIn(page, role);
    await page.context().storageState({ path: authFile(role) });
  });
}
