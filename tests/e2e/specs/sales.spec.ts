// The sales flow, end to end (docs/specs/sales-quotes-orders-stock.md):
// product and stock -> lead -> quotation -> order -> delivery -> payment -> print.
import { anonymous, expect, test } from "../fixtures.ts";

const major = { type: "severity", description: "major" };
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

test.describe("sales", () => {
  test("TC-SALES-01 lead to quotation to paid order, with stock following", { tag: ["@smoke", "@area-sales"], annotation: major }, async ({ asRole, db }) => {
    // --- A super_admin sets up the product, its price tier and the opening stock.
    const admin = await asRole("super_admin");
    await admin.goto("/sales/products");
    await admin.getByLabel("SKU").fill("E2E-SLIP");
    await admin.getByLabel("Name", { exact: true }).fill("[e2e] Coir slipper");
    await admin.getByRole("button", { name: "Add product" }).click();
    await expect(admin.getByText("Product added.")).toBeVisible();
    // Scope to this product's card: other specs create products on the same page in parallel.
    const card = admin.getByRole("listitem").filter({ hasText: "E2E-SLIP" });
    await card.getByLabel("From quantity").fill("10");
    await card.getByLabel("Price per pair (₱)").fill("120");
    await card.getByRole("button", { name: "Add tier" }).click();
    await expect(card.getByText("From 10 pairs")).toBeVisible();

    await admin.goto("/sales/stock");
    await admin.getByRole("combobox", { name: "Product" }).selectOption({ label: "[e2e] Coir slipper" });
    await admin.getByLabel("Change (pairs)").fill("100");
    await admin.getByRole("button", { name: "Record" }).click();
    await expect(admin.getByText("Stock updated.")).toBeVisible();
    const { data: product } = await db.from("sales_products").select("id").eq("sku", "E2E-SLIP").single();
    const productId = product!.id as string;
    await expect.poll(async () => (await db.from("stock_levels").select("on_hand").eq("product_id", productId).single()).data?.on_hand).toBe(100);

    // --- A lead with a company account, as the website would have produced.
    const account = await db.from("crm_accounts").insert({ name: "[e2e] Quote Hotel" }).select("id").single();
    const contact = await db.from("crm_contacts").insert({ email: "quote@test.local", full_name: "Quinn Quote" }).select("id").single();
    await db.from("crm_leads").insert({
      contact_id: contact.data!.id, account_id: account.data!.id, origin_form: "manual", status: "Qualified", position: 9000,
    });

    // --- A member quotes it.
    const member = await asRole("member");
    await member.goto("/crm");
    await member.getByRole("button", { name: /^\[e2e\] Quote Hotel/ }).click();
    await member.getByRole("button", { name: "New quotation" }).click();
    await expect(member).toHaveURL(/\/sales\/quotes\/[0-9a-f-]{36}$/);
    await expect(member.getByRole("heading", { level: 1 })).toContainText(/^Q-\d{4}-\d{4}/);

    await member.getByLabel("Valid until").fill(inDays(30));
    await member.getByRole("combobox", { name: "Product" }).selectOption({ label: "[e2e] Coir slipper (E2E-SLIP)" });
    await member.getByLabel("Qty", { exact: true }).fill("20");
    await expect(member.getByLabel("Price per pair", { exact: true })).toHaveValue("120"); // the tier price
    await member.getByRole("button", { name: "Add line" }).click();
    await expect(member.getByText("₱2,400.00").first()).toBeVisible();

    await member.getByRole("button", { name: "Mark as sent" }).click();
    await expect(member.getByText("Quotation sent.")).toBeVisible();
    // Sent means locked: no more line form, and the status shows.
    await expect(member.getByRole("button", { name: "Add line" })).toHaveCount(0);
    await member.getByRole("button", { name: "Customer accepted" }).click();
    await expect(member.getByText("Quotation accepted.")).toBeVisible();

    await member.getByRole("button", { name: "Create sales order" }).click();
    await member.getByRole("dialog").getByLabel("Customer PO number (optional)").fill("PO-7788");
    await member.getByRole("dialog").getByRole("button", { name: "Create order" }).click();
    await expect(member).toHaveURL(/\/sales\/orders\/[0-9a-f-]{36}$/);
    await expect(member.getByRole("heading", { level: 1 })).toContainText(/^SO-\d{4}-\d{4}/);
    const orderUrl = member.url();
    expect((await db.from("stock_levels").select("on_hand, reserved").eq("product_id", productId).single()).data).toEqual({ on_hand: 100, reserved: 20 });

    // --- Delivery takes the pairs out of stock.
    await member.getByRole("button", { name: "Mark as delivered" }).click();
    await expect(member.getByText("Marked as delivered.")).toBeVisible();
    expect((await db.from("stock_levels").select("on_hand, reserved").eq("product_id", productId).single()).data).toEqual({ on_hand: 80, reserved: 0 });

    // --- Payment needs the official invoice number from the booklet.
    await member.getByRole("button", { name: "Mark as paid" }).click();
    await expect(member.getByText("Record the official invoice number first.")).toBeVisible();
    await member.getByLabel("Official invoice number").fill("0001234");
    await member.getByRole("button", { name: "Mark as paid" }).click();
    await expect(member.getByText("Marked as paid.")).toBeVisible();
    await expect(member.getByText("0001234").first()).toBeVisible();

    // --- The printed order never calls itself an invoice.
    await member.goto(`${orderUrl}/print`);
    await expect(member.getByRole("heading", { level: 1, name: "Sales order" })).toBeVisible();
    await expect(member.getByText("This is not an official receipt or invoice.")).toBeVisible();
    await expect(member.getByText("[e2e] Quote Hotel").first()).toBeVisible();
    await expect(member.getByText("Official invoice no.: 0001234")).toBeVisible();
    await expect(member.getByText("Customer PO: PO-7788")).toBeVisible();
    await expect(member.getByText(/official invoice\b(?! no)/i)).toHaveCount(0);
  });

  test("TC-SALES-02 a contractor cannot open sales", { tag: ["@smoke", "@area-sales"], annotation: major }, async ({ asRole }) => {
    const contractor = await asRole("contractor");
    for (const path of ["/sales", "/sales/quotes", "/sales/orders", "/sales/stock"]) {
      await contractor.goto(path);
      await expect(contractor).toHaveURL(/\/tasks$/);
    }
  });

  test("TC-SALES-03 a member cannot open the product catalogue", { tag: ["@area-sales"], annotation: major }, async ({ asRole }) => {
    const member = await asRole("member");
    await member.goto("/sales/products");
    await expect(member).toHaveURL(/\/sales\/quotes$/);
    await expect(member.getByRole("link", { name: "Products" })).toHaveCount(0);
  });
});

test.describe("signed out", () => {
  test.use(anonymous);
  test("TC-SALES-04 sales pages need a login", { tag: ["@smoke", "@area-sales"], annotation: major }, async ({ page }) => {
    await page.goto("/sales/quotes");
    await expect(page).toHaveURL(/\/login/);
  });
});
