// 4.1 Auth — UC-01, UC-02 (docs/ui-testing.md)
import type { Page } from "@playwright/test";
import { anonymous, as, expect, test, USERS } from "../fixtures.ts";
import { signIn } from "../support/auth.ts";
import { SIGNOUT_USER, UNREGISTERED_INVITEE } from "../support/seed.ts";

// The login form's own alert (Next.js also renders an empty role=alert route announcer).
const formError = (page: Page) => page.locator("#login-form-error[role=alert]");

const blocker = { type: "severity", description: "blocker" };
const major = { type: "severity", description: "major" };
const minor = { type: "severity", description: "minor" };

test.describe("signed out", () => {
  test.use(anonymous);

  test("TC-AUTH-01 password sign-in lands on dashboard", { tag: ["@smoke", "@area-auth"], annotation: blocker }, async ({ page }) => {
    await signIn(page, "member");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText(USERS.member.email).filter({ visible: true }).first()).toBeVisible();
  });

  test("TC-AUTH-02 contractor sign-in lands on /tasks", { tag: ["@smoke", "@area-auth"], annotation: blocker }, async ({ page }) => {
    await signIn(page, "contractor");
    await expect(page).toHaveURL(/\/tasks$/);
  });

  test("TC-AUTH-03 protected route bounces to login and back", { tag: ["@smoke", "@area-auth"], annotation: blocker }, async ({ page }) => {
    await page.goto("/crm");
    await expect(page).toHaveURL(/\/login\?next=%2Fcrm/);
    await page.getByLabel("Email").fill(USERS.member.email);
    await page.getByLabel("Password").fill(USERS.member.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/crm$/);
  });

  test("TC-AUTH-04 wrong password shows an alert", { tag: ["@area-auth"], annotation: major }, async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(USERS.member.email);
    await page.getByLabel("Password").fill("definitely-wrong");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(formError(page)).toContainText("Invalid email or password");
  });

  test("TC-AUTH-05 uninvited signup is refused as invite-only", { tag: ["@smoke", "@area-auth"], annotation: blocker }, async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Create one" }).click();
    await page.getByLabel("Email").fill(`stranger-${Date.now()}@test.local`);
    await page.getByLabel("Password").fill("e2e-Password-123");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(formError(page)).toContainText(
      "Signups are invite-only. Ask a Bughaw admin"
    );
  });

  test("TC-AUTH-06 allowlisted signup signs in and lands on /", { tag: ["@area-auth"], annotation: major }, async ({ page }) => {
    // Creates a real auth user; global teardown deletes it (docs/ui-testing.md §1.1).
    await page.goto("/login");
    await page.getByRole("button", { name: "Create one" }).click();
    await page.getByLabel("Email").fill(UNREGISTERED_INVITEE);
    await page.getByLabel("Password").fill("e2e-Password-123");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("TC-AUTH-07 Google button starts OAuth with a callback redirect", { tag: ["@area-auth"], annotation: major }, async ({ page }) => {
    await page.goto("/login");
    const authorize = page.waitForRequest((r) => r.url().includes("/auth/v1/authorize"));
    // Don't follow the redirect out to Google.
    await page.route("**/auth/v1/authorize**", (route) => route.abort());
    await page.getByRole("button", { name: "Continue with Google" }).click();
    const url = new URL((await authorize).url());
    expect(url.searchParams.get("provider")).toBe("google");
    expect(url.searchParams.get("redirect_to")).toContain("/auth/callback?next=");
  });

  test("TC-AUTH-08 ?error=auth shows the failure message", { tag: ["@area-auth"], annotation: minor }, async ({ page }) => {
    await page.goto("/login?error=auth");
    await expect(formError(page)).toHaveText("Sign-in failed. Try again.");
  });

  test("TC-AUTH-11 short password is blocked by validation", { tag: ["@area-auth"], annotation: minor }, async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Create one" }).click();
    await page.getByLabel("Email").fill(UNREGISTERED_INVITEE);
    const password = page.getByLabel("Password");
    await password.fill("12345");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/login/);
    expect(await password.evaluate((el: HTMLInputElement) => el.validity.valid)).toBe(false);
  });
});

test.describe("signed in", () => {
  test("TC-AUTH-09 sign out returns to login and stays signed out", { tag: ["@smoke", "@area-auth"], annotation: blocker }, async ({ browser }) => {
    // Dedicated user + context: sign-out is global and would otherwise revoke the
    // shared member session the other specs reuse.
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await signIn(page, SIGNOUT_USER);
    await page.getByRole("button", { name: "Sign out" }).first().click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
    await context.close();
  });

  test.describe("member", () => {
    test.use(as("member"));
    test("TC-AUTH-10 signed-in member visiting /login goes to /", { tag: ["@area-auth"], annotation: minor }, async ({ page }) => {
      await page.goto("/login");
      await expect(page).toHaveURL(/\/$/);
    });
  });

  test.describe("contractor", () => {
    test.use(as("contractor"));
    test("TC-AUTH-10 signed-in contractor visiting /login goes to /tasks", { tag: ["@area-auth"], annotation: minor }, async ({ page }) => {
      await page.goto("/login");
      await expect(page).toHaveURL(/\/tasks$/);
    });
  });
});
