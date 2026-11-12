// CRM deal fields and follow-ups (docs/specs/crm-deal-fields.md).
import { as, expect, FIXTURES, test } from "../fixtures.ts";

const major = { type: "severity", description: "major" };
const qualified = FIXTURES.leads[1];
const fresh = FIXTURES.leads[0];

test.describe("member works a deal", () => {
  test.use(as("member"));
  test.describe.configure({ mode: "serial" });

  test("TC-DEAL-01 saves a deal and shows it on the card and in follow-ups", { tag: ["@smoke", "@area-crm"], annotation: major }, async ({ page, db }) => {
    await page.goto("/crm");
    await page.getByRole("button", { name: new RegExp(`^${escape(qualified.name)}`) }).click();

    const panel = page.getByRole("dialog");
    await panel.getByLabel("Deal value (₱)").fill("125000");
    await panel.getByLabel("Next action", { exact: true }).fill("Send revised quotation");
    await panel.getByRole("button", { name: "Save deal" }).click();
    await expect(panel.getByText("Set a due date for the next action.")).toBeVisible();

    await panel.getByLabel("Next action due").fill("2026-01-05"); // long past: overdue
    await panel.getByRole("button", { name: "Save deal" }).click();
    await expect(page.getByText("Deal saved.")).toBeVisible();
    await expect(panel.getByText("Follow-up overdue since 2026-01-05.")).toBeVisible();

    const { data } = await db.from("crm_leads").select("deal_value, next_action, next_action_due_on").eq("id", qualified.id).single();
    expect(data).toMatchObject({ deal_value: 125000, next_action: "Send revised quotation", next_action_due_on: "2026-01-05" });

    await panel.getByRole("button", { name: "Close" }).click();
    const card = page.getByRole("button", { name: new RegExp(`^${escape(qualified.name)}`) });
    await expect(card).toContainText("₱125,000");
    await expect(card).toContainText("Overdue");
    await expect(page.getByLabel("Pipeline totals")).toContainText("₱125,000");

    await page.getByRole("tab", { name: /Follow-ups \(1 overdue\)/ }).click();
    await expect(page.getByRole("region", { name: "Overdue" })).toContainText("Send revised quotation");
  });

  test("TC-DEAL-02 closing as lost needs a reason", { tag: ["@smoke", "@area-crm"], annotation: major }, async ({ page, db }) => {
    await page.goto("/crm");
    await page.getByRole("button", { name: new RegExp(`^${escape(fresh.name)}`) }).click();
    const panel = page.getByRole("dialog");

    await panel.getByLabel("Status").selectOption("Closed Lost");
    const confirm = panel.getByRole("button", { name: "Mark as lost" });
    await expect(confirm).toBeDisabled();
    const before = await db.from("crm_leads").select("status").eq("id", fresh.id).single();
    expect(before.data?.status).toBe("New");

    await panel.getByLabel("Lost reason").selectOption("price");
    await confirm.click();
    await expect(panel.getByText("Lost reason: Price")).toBeVisible();

    const after = await db.from("crm_leads").select("status, lost_reason").eq("id", fresh.id).single();
    expect(after.data).toEqual({ status: "Closed Lost", lost_reason: "price" });
  });
});

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
