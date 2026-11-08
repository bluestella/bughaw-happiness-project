import path from "node:path";
import { expect, type Page } from "@playwright/test";
import { ROOT } from "./env.ts";
import { USERS, type Role } from "./seed.ts";

export const ROLES: Role[] = ["super_admin", "member", "contractor"];

export function authFile(role: Role) {
  return path.join(ROOT, "playwright", ".auth", `${role}.json`);
}

/** Signs in through the real login form. */
export async function signIn(
  page: Page,
  who: Role | { email: string; password: string },
  next?: string
) {
  const { email, password } = typeof who === "string" ? USERS[who] : who;
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
}
