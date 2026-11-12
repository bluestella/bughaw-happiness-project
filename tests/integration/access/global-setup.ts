// Seeds the same users and fixtures as the Playwright suite, plus one signed-in
// user with NO role, then restores the database to its baseline afterwards.
// The test-data rule applies here too (docs/ui-testing.md §1.1): nothing is left
// behind, and the run fails if anything is.
import e2eSetup from "../../e2e/global-setup.ts";
import e2eTeardown from "../../e2e/global-teardown.ts";
import { adminClient } from "../../e2e/support/admin.ts";
import { NO_ROLE_USER } from "./actors.ts";

export default async function setup() {
  await e2eSetup();
  const db = adminClient();
  try {
    // A user can only register while on the allowlist. Removing the row
    // afterwards leaves a valid session whose role is NULL: the caller that the
    // 0008 bug let through.
    const { email, password } = NO_ROLE_USER;
    const add = await db.from("allowed_emails").insert({ email, note: "access test: no role", role: "member" });
    if (add.error) throw new Error(`allowlist ${email}: ${add.error.message}`);
    const created = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw new Error(`create ${email}: ${created.error.message}`);
    const del = await db.from("allowed_emails").delete().eq("email", email);
    if (del.error) throw new Error(`un-allowlist ${email}: ${del.error.message}`);
  } catch (err) {
    await e2eTeardown();
    throw err;
  }
  return async () => {
    await e2eTeardown();
  };
}
