// The startup calculators render and compute on the real pages (docs/product.md).
import { as, expect, test } from "../fixtures.ts";

const minor = { type: "severity", description: "minor" };

const NEW_CALCULATORS = [
  ["go-to-market", "sales-velocity", "₱187,500"],
  ["go-to-market", "pipeline-forecast", "₱465,000"],
  ["go-to-market", "market-size", "₱1,800,000"],
  ["unit-economics", "volume-pricing", "₱125"],
  ["unit-economics", "landed-cost", "₱78"],
  ["unit-economics", "sensitivity", "₱22,000"],
  ["financial", "cap-table", "73.3%"],
  ["financial", "safe-conversion", "₱2"],
  ["financial", "use-of-funds", "13.6 mo"],
  ["product-mgmt", "cash-conversion", "105.4"],
  ["product-mgmt", "batch-yield", "₱59"],
] as const;

test.describe("startup calculators", () => {
  test.use(as("member"));

  for (const [category, id, expected] of NEW_CALCULATORS) {
    test(`TC-CALC-${id} shows its default result`, { tag: ["@smoke", "@area-calc"], annotation: minor }, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`/calculators/${category}/${id}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByText(expected, { exact: false }).first()).toBeVisible();
      expect(errors).toEqual([]);
    });
  }

  test("TC-CALC-cap-table recomputes when an input changes", { tag: ["@area-calc"], annotation: minor }, async ({ page }) => {
    await page.goto("/calculators/financial/cap-table");
    const raise = page.getByLabel("Amount raised");
    await raise.fill("20000000");
    await page.getByLabel("Option pool after the round").fill("15");
    await expect(page.getByText("35%", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("Founders fall below 50%", { exact: false })).toBeVisible();
  });
});
