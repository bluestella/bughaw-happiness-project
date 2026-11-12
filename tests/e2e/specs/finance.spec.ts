// Expenses, cash, budget and runway, end to end (migration 0020).
import { expect, test } from "../fixtures.ts";

const major = { type: "severity", description: "major" };
const firstOfMonth = (offset: number) => {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + offset);
  return d.toISOString().slice(0, 10);
};

test.describe("finance", () => {
  test.describe.configure({ mode: "serial" });
  test.afterEach(async ({ db }) => {
    await db.from("fin_expenses").delete().like("description", "[e2e]%");
    await db.from("fin_budgets").delete().gte("month_start", "2000-01-01");
    await db.from("fin_cash_balances").delete().gte("as_of", "2000-01-01");
  });

  test("TC-FIN-01 record cash and expenses, void one, set a budget, see the runway", { tag: ["@smoke", "@area-finance"], annotation: major }, async ({ asRole, db }) => {
    // Three completed months of spending, so a burn and a runway can be worked out.
    const { data: cats } = await db.from("fin_categories").select("id, name").eq("name", "Materials and production").single();
    for (const m of [-1, -2, -3]) {
      await db.from("fin_expenses").insert({ spent_on: firstOfMonth(m), amount: 100000, category_id: cats!.id, description: "[e2e] earlier month" });
    }

    const admin = await asRole("super_admin");
    await admin.goto("/finance");
    await admin.getByLabel("Total cash (₱)").fill("400000");
    await admin.getByRole("button", { name: "Save" }).click();
    await expect(admin.getByText("Cash balance saved.")).toBeVisible();
    await expect(admin.getByLabel("Cash position")).toContainText("₱400,000.00");
    await expect(admin.getByLabel("Cash position")).toContainText("average of the last 3 complete months");
    await expect(admin.getByLabel("Cash position")).toContainText("4 months");
    await expect(admin.getByText("Under 6 months of cash")).toBeVisible();

    // An expense with a bad amount is refused with a plain message.
    await admin.goto("/finance/expenses");
    await admin.getByRole("combobox", { name: "Category" }).selectOption({ label: "Materials and production" });
    await admin.getByLabel("What it was for").fill("[e2e] Husk fibre");
    await admin.getByRole("button", { name: "Add expense" }).click();
    await expect(admin.getByText("Enter the amount.")).toBeVisible();

    await admin.getByLabel("Amount (₱)").fill("12,500.50");
    await admin.getByLabel("Receipt no. (optional)").fill("OR-4471");
    await admin.getByRole("button", { name: "Add expense" }).click();
    await expect(admin.getByText("Expense recorded.")).toBeVisible();
    const table = admin.getByRole("table", { name: "Expenses" });
    await expect(table).toContainText("[e2e] Husk fibre");
    await expect(table).toContainText("OR-4471");
    await expect(admin.getByLabel("Expenses this month")).toContainText("₱12,500.50");

    // Void it: it stays, struck through, and stops counting.
    await admin.getByRole("button", { name: "Void [e2e] Husk fibre" }).click();
    await admin.getByRole("dialog").getByRole("button", { name: "Void expense" }).click();
    await expect(admin.getByText("Say why you are voiding it.")).toBeVisible();
    await admin.getByRole("dialog").getByLabel("Reason").fill("Entered twice");
    await admin.getByRole("dialog").getByRole("button", { name: "Void expense" }).click();
    await expect(admin.getByText("Expense voided.")).toBeVisible();
    await expect(table).toContainText("Voided: Entered twice");
    await expect(admin.getByLabel("Expenses this month")).toContainText("₱0.00");

    // A budget, compared with this month's spending.
    await admin.goto("/finance/budget");
    await admin.getByLabel("Planned for Materials and production").fill("20000");
    await admin.getByRole("button", { name: "Save budget" }).click();
    await expect(admin.getByText("Budget saved.")).toBeVisible();
    await admin.goto("/finance");
    await expect(admin.getByLabel("This month against budget")).toContainText("Materials and production");
    await expect(admin.getByLabel("This month against budget")).toContainText("₱20,000.00");
  });

  test("TC-FIN-02 finance is closed to members by default", { tag: ["@smoke", "@area-finance"], annotation: major }, async ({ asRole }) => {
    for (const role of ["member", "contractor"] as const) {
      const page = await asRole(role);
      for (const path of ["/finance", "/finance/expenses", "/finance/budget"]) {
        await page.goto(path);
        await expect(page).not.toHaveURL(/\/finance/);
      }
      await expect(page.getByRole("link", { name: "Cash and spending" })).toHaveCount(0);
    }
  });

  test("TC-FIN-03 a per-person grant opens it for a member", { tag: ["@area-finance"], annotation: major }, async ({ asRole, db }) => {
    await db.from("user_section_overrides").insert({ email: "member@test.local", section: "finance", allowed: true });
    try {
      const member = await asRole("member");
      await member.goto("/finance");
      await expect(member.getByRole("heading", { level: 1, name: "Cash, spending and runway" })).toBeVisible();
    } finally {
      await db.from("user_section_overrides").delete().match({ email: "member@test.local", section: "finance" });
    }
  });
});
