// Runs once before the suite. Order matters for the test-data rule
// (docs/ui-testing.md §1.1): snapshot the baseline FIRST, then seed, so teardown
// can delete every seeded row and user again.
import { adminClient } from "./support/admin.ts";
import {
  assertCoversSchema,
  clearBaseline,
  loadBaseline,
  restoreAndVerify,
  saveBaseline,
  snapshot,
} from "./support/baseline.ts";
import { e2eEnv } from "./support/env.ts";
import { seedFixtures, seedUsers } from "./support/seed.ts";

export default async function globalSetup() {
  const env = e2eEnv(); // throws unless Supabase is local
  const db = adminClient();
  await assertCoversSchema(env.supabaseUrl, env.serviceRoleKey);

  // A baseline file left behind means the last run never reached teardown
  // (Ctrl-C, crash). Clean up after it before taking a new baseline, or its
  // leftovers would become part of the new one.
  const stale = loadBaseline();
  if (stale) {
    const removed = await restoreAndVerify(db, stale);
    console.log(`[e2e] cleaned ${removed} leftover row(s)/user(s) from an interrupted run`);
    clearBaseline();
  }

  const baseline = await snapshot(db);
  saveBaseline(baseline);

  try {
    await seedUsers(db);
    await seedFixtures(db);
  } catch (err) {
    await restoreAndVerify(db, baseline);
    clearBaseline();
    throw err;
  }
}
