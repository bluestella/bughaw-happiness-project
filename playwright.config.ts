// Playwright E2E config — see docs/ui-testing.md.
// Tests run ONLY against the local Supabase stack (env.ts refuses anything else),
// and global teardown deletes everything a run created (§1.1).
import { defineConfig, devices } from "@playwright/test";
import { appServerEnv, e2eEnv } from "./tests/e2e/support/env.ts";

const env = e2eEnv();
const CI = !!process.env.CI;
const port = new URL(env.baseURL).port || "3100";

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  workers: CI ? 2 : undefined,
  timeout: 30_000,
  expect: { timeout: 7_500 },
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
    ["json", { outputFile: "test-results/report.json" }],
    ...(CI ? ([["github"]] as const) : []),
  ],
  use: {
    baseURL: env.baseURL,
    locale: "en-PH",
    timezoneId: "Asia/Manila",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
      testMatch: /specs\/.*\.spec\.ts/,
      testIgnore: /visual\.spec\.ts/,
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
      dependencies: ["setup"],
      testMatch: /specs\/.*\.spec\.ts/,
      grep: /@mobile/,
    },
    {
      name: "mobile-webkit",
      use: { ...devices["iPhone 14"] },
      dependencies: ["setup"],
      testMatch: /specs\/.*\.spec\.ts/,
      grep: /@public|@mobile/,
    },
    {
      name: "visual",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
      dependencies: ["setup"],
      testMatch: /visual\.spec\.ts/,
    },
  ],
  webServer: {
    // CI mirrors production (build + start); locally a dev server on the E2E port.
    // A separate port (3100) so a normal `npm run dev` on :3000, which may point
    // at the hosted Supabase, is never reused by mistake.
    command: CI ? `npm run build && npx next start -p ${port}` : `npx next dev -p ${port}`,
    url: `${env.baseURL}/login`,
    reuseExistingServer: !CI,
    timeout: 180_000,
    env: appServerEnv(),
  },
});
