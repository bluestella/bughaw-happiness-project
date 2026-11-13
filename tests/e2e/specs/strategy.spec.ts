// Strategy worksheets, end to end (migration 0022).
import { expect, test } from "../fixtures.ts";

const major = { type: "severity", description: "major" };

test.describe("strategy worksheets", () => {
  test.describe.configure({ mode: "serial" });
  test.afterEach(async ({ db }) => {
    await db.from("strategy_worksheets").delete().like("title", "[e2e]%");
  });

  test("TC-STRAT-01 create a RICE worksheet, rank two ideas, save, and find it again", { tag: ["@smoke", "@area-strategy"], annotation: major }, async ({ asRole }) => {
    const member = await asRole("member");
    await member.goto("/strategy");
    await member.getByRole("combobox", { name: "Framework" }).selectOption("rice");
    await member.getByLabel("Title").fill("[e2e] Q1 ideas");
    await member.getByRole("button", { name: "Create worksheet" }).click();
    await expect(member.getByRole("heading", { level: 1, name: "RICE prioritisation" })).toBeVisible();

    await member.getByRole("button", { name: "Add idea" }).click();
    await member.getByLabel("Idea 1", { exact: true }).fill("Hotel pilot pack");
    await member.getByRole("spinbutton", { name: /^Reach/ }).first().fill("200");
    await member.getByRole("spinbutton", { name: "Confidence %" }).first().fill("100");
    await member.getByRole("spinbutton", { name: /^Effort/ }).first().fill("2");
    await member.getByRole("combobox", { name: "Impact of idea 1" }).selectOption("2");
    await member.getByRole("button", { name: "Add idea" }).click();
    await member.getByLabel("Idea 2", { exact: true }).fill("New website page");
    await member.getByRole("spinbutton", { name: /^Reach/ }).nth(1).fill("50");
    await member.getByRole("spinbutton", { name: "Confidence %" }).nth(1).fill("100");
    await member.getByRole("spinbutton", { name: /^Effort/ }).nth(1).fill("1");

    // 200 x 2 x 1 / 2 = 200 beats 50 x 1 x 1 / 1 = 50.
    const result = member.getByLabel("Do these first");
    await expect(result).toContainText("1. Hotel pilot pack");
    await expect(result).toContainText("200");
    await expect(result).toContainText("2. New website page");

    await member.getByRole("button", { name: "Save" }).click();
    await expect(member.getByText("Saved.")).toBeVisible();
    await member.reload();
    await expect(member.getByLabel("Idea 1", { exact: true })).toHaveValue("Hotel pilot pack");
    await member.goto("/strategy");
    await expect(member.getByRole("link", { name: /\[e2e\] Q1 ideas/ })).toContainText("Top: Hotel pilot pack (200)");
  });

  test("TC-STRAT-02 a stale save is refused instead of overwriting", { tag: ["@area-strategy"], annotation: major }, async ({ asRole, db }) => {
    const { data } = await db.from("strategy_worksheets")
      .insert({ kind: "sean_ellis", title: "[e2e] Survey", data: { very: 1, somewhat: 1, not: 1, na: 0, notes: "" } }).select("id").single();
    const member = await asRole("member");
    await member.goto(`/strategy/${data!.id}`);
    await member.getByLabel("Worksheet title").fill("[e2e] Survey mine");
    // Someone else saves first.
    await db.from("strategy_worksheets").update({ title: "[e2e] Survey theirs" }).eq("id", data!.id);
    await member.getByRole("button", { name: "Save" }).click();
    await expect(member.getByText("Someone saved a newer version")).toBeVisible();
    const { data: row } = await db.from("strategy_worksheets").select("title").eq("id", data!.id).single();
    expect(row!.title).toBe("[e2e] Survey theirs");
  });

  test("TC-STRAT-03 contractors are sent away; only a super_admin sees Delete", { tag: ["@smoke", "@area-strategy"], annotation: major }, async ({ asRole, db }) => {
    const { data } = await db.from("strategy_worksheets").insert({ kind: "porter", title: "[e2e] Forces", data: {} }).select("id").single();
    const contractor = await asRole("contractor");
    for (const path of ["/strategy", `/strategy/${data!.id}`]) {
      await contractor.goto(path);
      await expect(contractor).not.toHaveURL(/\/strategy/);
    }
    const member = await asRole("member");
    await member.goto(`/strategy/${data!.id}`);
    await expect(member.getByRole("heading", { level: 1, name: "Five Forces" })).toBeVisible();
    await expect(member.getByRole("button", { name: "Delete" })).toHaveCount(0);
    const admin = await asRole("super_admin");
    await admin.goto(`/strategy/${data!.id}`);
    await admin.getByRole("button", { name: "Delete" }).click();
    await admin.getByRole("button", { name: "Delete" }).last().click();
    await expect(admin).toHaveURL(/\/strategy$/);
    const { data: gone } = await db.from("strategy_worksheets").select("id").eq("id", data!.id);
    expect(gone).toHaveLength(0);
  });

  test("TC-STRAT-04 every framework opens and shows its result panel", { tag: ["@area-strategy"], annotation: major }, async ({ asRole, db }) => {
    const kinds: [string, string][] = [
      ["porter", "Five Forces"], ["three_horizons", "Three Horizons"], ["balanced_scorecard", "Balanced Scorecard"],
      ["rice", "RICE prioritisation"], ["nine_box", "Nine-box grid"], ["sean_ellis", "Product-market fit survey"],
    ];
    const member = await asRole("member");
    for (const [kind, h1] of kinds) {
      const { data } = await db.from("strategy_worksheets").insert({ kind, title: `[e2e] ${kind}`, data: {} }).select("id").single();
      await member.goto(`/strategy/${data!.id}`);
      await expect(member.getByRole("heading", { level: 1, name: h1 })).toBeVisible();
      await expect(member.getByRole("button", { name: "Saved" })).toBeDisabled();
    }
  });
});
