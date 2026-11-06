// `npm run e2e:clean` — manual recovery after an interrupted run (Ctrl-C can skip
// global teardown). Same diff-delete + leak check as teardown, against the
// baseline saved in playwright/.baseline.json. docs/ui-testing.md §1.1.
import { adminClient } from "../../tests/e2e/support/admin.ts";
import {
  clearBaseline,
  loadBaseline,
  restoreAndVerify,
} from "../../tests/e2e/support/baseline.ts";

const baseline = loadBaseline();
if (!baseline) {
  console.log("[e2e] no saved baseline: the last run cleaned up after itself. Nothing to do.");
  console.log("      For a full reset, run `npm run e2e:db`.");
  process.exit(0);
}
const removed = await restoreAndVerify(adminClient(), baseline);
clearBaseline();
console.log(`[e2e] removed ${removed} leftover row(s)/user(s); database matches baseline`);
