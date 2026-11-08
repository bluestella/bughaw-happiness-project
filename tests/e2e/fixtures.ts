// Shared test fixtures. Import `test` and `expect` from here, not @playwright/test.
import { test as base, expect, type Browser, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "./support/admin.ts";
import { authFile } from "./support/auth.ts";
import type { Role } from "./support/seed.ts";

export { expect };
export { authFile };
export { FIXTURES, USERS } from "./support/seed.ts";

/**
 * Unique, visibly-marked test value: "[e2e] <label> w<worker>-<time>".
 * The "[e2e]" prefix only makes stray rows obvious in the UI; cleanup itself
 * is a baseline diff and doesn't depend on it (docs/ui-testing.md §1.1).
 */
export function uniqValue(label: string, workerIndex: number) {
  return `[e2e] ${label} w${workerIndex}-${Date.now().toString(36)}`;
}

type Fixtures = {
  /** Service-role client for arranging/asserting state. Local DB only. */
  db: SupabaseClient;
  uniq: (label: string) => string;
  /** Opens a page in a fresh context signed in as `role` (for multi-role tests). */
  asRole: (role: Role) => Promise<Page>;
};

async function openAs(browser: Browser, role: Role, opened: Page[]) {
  const context = await browser.newContext({ storageState: authFile(role) });
  const page = await context.newPage();
  opened.push(page);
  return page;
}

export const test = base.extend<Fixtures>({
  db: async ({}, use) => {
    await use(adminClient());
  },
  uniq: async ({}, use, testInfo) => {
    await use((label) => uniqValue(label, testInfo.workerIndex));
  },
  asRole: async ({ browser }, use) => {
    const opened: Page[] = [];
    await use((role) => openAs(browser, role, opened));
    for (const page of opened) await page.context().close();
  },
});

/** Use inside a describe: `test.use(as("member"))`. */
export const as = (role: Role) => ({ storageState: authFile(role) });
/** Signed-out context. */
export const anonymous = { storageState: { cookies: [], origins: [] } };
