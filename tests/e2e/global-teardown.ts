// Runs once after the suite, pass or fail: puts the database back to the
// baseline and fails the run if anything is left over (docs/ui-testing.md §1.1).
import { adminClient } from "./support/admin.ts";
import { clearBaseline, loadBaseline, restoreAndVerify } from "./support/baseline.ts";

export default async function globalTeardown() {
  const baseline = loadBaseline();
  if (!baseline) {
    // Global setup failed before seeding, or cleaned up after its own failure
    // (it runs the same restore + leak check). Nothing left to do.
    console.warn("[e2e] no baseline file: global setup did not complete; nothing to clean.");
    return;
  }
  const removed = await restoreAndVerify(adminClient(), baseline);
  clearBaseline();
  console.log(`[e2e] teardown removed ${removed} test row(s)/user(s); database matches baseline`);
}
