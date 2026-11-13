// Production batches, supplier lots and material tests, end to end (migration 0023).
import { expect, test } from "../fixtures.ts";

const major = { type: "severity", description: "major" };

test.describe("production", () => {
  test.describe.configure({ mode: "serial" });
  let productId = "";
  test.beforeEach(async ({ db }) => {
    const { data } = await db.from("sales_products").insert({ sku: `e2e-prod-${Date.now()}`, name: "[e2e] Hotel slipper" }).select("id").single();
    productId = data!.id as string;
  });
  test.afterEach(async ({ db }) => {
    await db.from("material_tests").delete().like("test_name", "[e2e]%");
    await db.from("production_batches").delete().like("batch_no", "e2e-%");
    await db.from("supplier_lots").delete().like("supplier", "[e2e]%");
    await db.from("stock_adjustments").delete().eq("product_id", productId);
    await db.from("sales_products").delete().eq("id", productId);
  });

  test("TC-PROD-01 record a batch, then a super_admin completes it and the stock goes up", { tag: ["@smoke", "@area-production"], annotation: major }, async ({ asRole, db }) => {
    const member = await asRole("member");
    await member.goto("/production");
    await member.getByLabel("Batch number").fill("e2e-001");
    await member.getByRole("combobox", { name: "Product" }).selectOption(productId);
    await member.getByLabel("Pairs made").fill("100");
    await member.getByLabel("Pairs rejected").fill("10");
    await member.getByLabel("Labour hours").fill("18");
    await member.getByLabel("Total batch cost (₱)").fill("9,000");
    await member.getByRole("button", { name: "Record batch" }).click();
    await expect(member.getByText("Batch recorded.")).toBeVisible();

    const row = member.getByRole("row", { name: /e2e-001/ });
    await expect(row).toContainText("90%");
    await expect(row).toContainText("₱100.00"); // 9,000 over 90 good pairs
    await expect(row).toContainText("Open");
    // A member can edit but not complete.
    await expect(row.getByRole("button", { name: "Edit batch e2e-001" })).toBeVisible();
    await expect(row.getByRole("button", { name: /Complete batch/ })).toHaveCount(0);

    const admin = await asRole("super_admin");
    await admin.goto("/production");
    await admin.getByRole("button", { name: "Complete batch e2e-001" }).click();
    await expect(admin.getByText("adds 90 pairs")).toBeVisible();
    await admin.getByRole("button", { name: "Complete batch", exact: true }).click();
    await expect(admin.getByText("90 pairs added to stock.")).toBeVisible();
    await expect(admin.getByRole("row", { name: /e2e-001/ })).toContainText("Completed");
    await expect(admin.getByRole("button", { name: "Edit batch e2e-001" })).toHaveCount(0);

    const { data } = await db.from("stock_levels").select("on_hand").eq("product_id", productId).single();
    expect(data!.on_hand).toBe(90);
    await expect(admin.getByLabel("Completed batches")).toContainText("₱100.00");
  });

  test("TC-PROD-02 a bad batch is refused with plain messages", { tag: ["@area-production"], annotation: major }, async ({ asRole }) => {
    const member = await asRole("member");
    await member.goto("/production");
    await member.getByLabel("Batch number").fill("e2e-002");
    await member.getByLabel("Pairs made").fill("5");
    await member.getByLabel("Pairs rejected").fill("9");
    await member.getByRole("button", { name: "Record batch" }).click();
    await expect(member.getByText("Choose the product.")).toBeVisible();
    await expect(member.getByText("Rejected pairs cannot be more than pairs made.")).toBeVisible();
  });

  test("TC-PROD-03 record a supplier lot and a test linked to it", { tag: ["@smoke", "@area-production"], annotation: major }, async ({ asRole }) => {
    const member = await asRole("member");
    await member.goto("/production/lots");
    await member.getByLabel("Supplier").fill("[e2e] Coir Co.");
    await member.getByLabel("Lot number").fill("L-77");
    await member.getByLabel("Material").fill("Coir fibre");
    await member.getByLabel("Quantity").fill("500");
    await member.getByLabel("Total cost (₱)").fill("1,250");
    await member.getByRole("button", { name: "Record lot" }).click();
    await expect(member.getByText("Lot recorded.")).toBeVisible();
    await expect(member.getByRole("row", { name: /L-77/ })).toContainText("₱2.50 / kg");

    await member.goto("/production/tests");
    await member.getByLabel("Material").fill("Coir fibre");
    await member.getByLabel("Test", { exact: true }).fill("[e2e] Moisture");
    await member.getByLabel("Result", { exact: true }).fill("11%");
    await member.getByRole("combobox", { name: "Supplier lot" }).selectOption({ label: "[e2e] Coir Co. L-77" });
    await member.getByRole("button", { name: "Record test" }).click();
    await expect(member.getByText("Test recorded.")).toBeVisible();
    await expect(member.getByRole("row", { name: /\[e2e\] Moisture/ })).toContainText("[e2e] Coir Co. L-77");
    await expect(member.getByLabel("Test results")).toContainText("100%");

    // Duplicate lot number for the same supplier is refused.
    await member.goto("/production/lots");
    await member.getByLabel("Supplier").fill("[e2e] coir co.");
    await member.getByLabel("Lot number").fill("l-77");
    await member.getByLabel("Material").fill("Coir fibre");
    await member.getByLabel("Quantity").fill("1");
    await member.getByRole("button", { name: "Record lot" }).click();
    await expect(member.getByText("That supplier already has a lot with that number.")).toBeVisible();
  });

  test("TC-PROD-04 production is closed to contractors by default", { tag: ["@smoke", "@area-production"], annotation: major }, async ({ asRole }) => {
    const contractor = await asRole("contractor");
    for (const path of ["/production", "/production/lots", "/production/tests"]) {
      await contractor.goto(path);
      await expect(contractor).not.toHaveURL(/\/production/);
    }
    await expect(contractor.getByRole("link", { name: "Supplier lots" })).toHaveCount(0);
  });
});
