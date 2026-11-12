// Intern daily log and weekly report, end to end (docs/specs/intern-log-and-reports.md):
// log a day -> report -> submit -> supervisor returns -> resubmit -> approve -> print.
import { expect, test, USERS } from "../fixtures.ts";

const major = { type: "severity", description: "major" };

test.describe("people", () => {
  // The tests share one intern (the contractor), so they run one after another and
  // each leaves the people tables empty for the next. Reports first: a submitted
  // week locks its logs against direct deletes.
  test.describe.configure({ mode: "serial" });
  test.afterEach(async ({ db }) => {
    await db.from("people_weekly_reports").delete().eq("intern_email", USERS.contractor.email);
    await db.from("people_daily_logs").delete().eq("intern_email", USERS.contractor.email);
    await db.from("people_interns").delete().eq("email", USERS.contractor.email);
  });

  test("TC-PEOPLE-01 intern logs a day, reports, is returned, resubmits and is approved", { tag: ["@smoke", "@area-people"], annotation: major }, async ({ asRole, db }) => {
    await db.from("people_interns").insert({
      email: USERS.contractor.email, full_name: "Casey Intern", discipline: "marketing",
      school: "Test University", required_hours: 100, supervisor_email: USERS.member.email,
    });

    // --- The intern logs today.
    const intern = await asRole("contractor");
    await intern.goto("/people");
    await expect(intern).toHaveURL(/\/people\/my-log$/);
    await expect(intern.getByText("0 of 100 required hours")).toBeVisible();
    const today = intern.getByRole("listitem").filter({ hasText: "Today" });
    await today.getByPlaceholder("Hours").fill("4.5");
    await today.getByPlaceholder("What did you do?").fill("Drafted three posts for the resort launch");
    await today.getByRole("button", { name: "Add" }).click();
    await expect(intern.getByText("Day logged.")).toBeVisible();
    await expect(intern.getByText("4.5 of 100 required hours")).toBeVisible();

    // A bad entry is refused with a plain message and nothing is saved.
    await today.getByPlaceholder("Hours").fill("13");
    await today.getByRole("button", { name: "Save" }).click();
    await expect(today.getByRole("alert")).toContainText("at most 12");

    // --- The weekly report, built from the log.
    await intern.goto("/people/my-reports");
    await intern.getByRole("button", { name: "Start report" }).click();
    await expect(intern).toHaveURL(/\/people\/reports\/[0-9a-f-]{36}$/);
    const reportUrl = intern.url();
    await intern.getByRole("button", { name: "Fill from my daily log" }).click();
    await expect(intern.getByLabel("What I accomplished")).toHaveValue(/Drafted three posts/);
    await intern.getByLabel("What I learned").fill("Short hooks work better");
    await intern.getByRole("button", { name: "Submit for review" }).click();
    await expect(intern.getByText("Report submitted.")).toBeVisible();
    await expect(intern.getByRole("button", { name: "Submit for review" })).toHaveCount(0);

    // The week is locked: the day can no longer be changed.
    await intern.goto("/people/my-log");
    await expect(intern.getByText("logs are locked").first()).toBeVisible();

    // --- The supervisor returns it, with a comment.
    const sup = await asRole("member");
    await sup.goto("/people");
    await expect(sup).toHaveURL(/\/people\/review$/);
    await expect(sup.getByText("Casey Intern")).toBeVisible();
    await sup.goto(reportUrl);
    await sup.getByRole("button", { name: "Return to intern" }).click();
    await expect(sup.getByText("Say what needs to change")).toBeVisible();
    await sup.getByLabel(/Comment/).fill("Add reach numbers for each post");
    await sup.getByRole("button", { name: "Return to intern" }).click();
    await expect(sup.getByText("Report returned.")).toBeVisible();

    // --- The intern fixes it and resubmits.
    await intern.goto(reportUrl);
    await expect(intern.getByText("Returned: Add reach numbers for each post")).toBeVisible();
    await intern.getByLabel("What I learned").fill("Short hooks work better; reach doubled on reels");
    await intern.getByRole("button", { name: "Submit for review" }).click();
    await expect(intern.getByText("Report submitted.")).toBeVisible();

    // --- The supervisor approves.
    await sup.goto(reportUrl);
    await sup.getByRole("button", { name: "Approve" }).click();
    await expect(sup.getByText("Report approved.")).toBeVisible();
    await expect(sup.getByText(`Approved by ${USERS.member.email}`)).toBeVisible();

    // --- The printed report carries the approval.
    await intern.goto(`${reportUrl}/print`);
    await expect(intern.getByRole("heading", { level: 1, name: "Weekly accomplishment report" })).toBeVisible();
    await expect(intern.getByText("Casey Intern")).toBeVisible();
    await expect(intern.getByText("Test University")).toBeVisible();
    await expect(intern.getByText(`Approved by ${USERS.member.email}`)).toBeVisible();
    await expect(intern.getByText("Drafted three posts for the resort launch").first()).toBeVisible();
  });

  test("TC-PEOPLE-02 an intern cannot open the review or intern-management pages", { tag: ["@smoke", "@area-people"], annotation: major }, async ({ asRole, db }) => {
    await db.from("people_interns").insert({ email: USERS.contractor.email, discipline: "graphics", required_hours: 50 });
    const intern = await asRole("contractor");
    for (const path of ["/people/review", "/people/overview", "/people/interns"]) {
      await intern.goto(path);
      await expect(intern).toHaveURL(/\/people\/my-log$/);
    }
  });

  test("TC-PEOPLE-03 someone who is neither intern nor supervisor sees an explanation, not data", { tag: ["@area-people"], annotation: major }, async ({ asRole }) => {
    const member = await asRole("member");
    await member.goto("/people");
    await expect(member.getByText("not set up as an intern or a supervisor")).toBeVisible();
  });

  test("TC-PEOPLE-04 a super_admin sees the intern and the overview", { tag: ["@area-people"], annotation: major }, async ({ asRole, db }) => {
    await db.from("people_interns").insert({ email: USERS.contractor.email, full_name: "Casey Intern", discipline: "chemical_engineering", school: "Test University", required_hours: 200 });
    const admin = await asRole("super_admin");
    await admin.goto("/people/interns");
    await expect(admin.getByText("Casey Intern")).toBeVisible();
    await admin.goto("/people/overview");
    await expect(admin.getByRole("table", { name: "Intern overview" })).toContainText("Casey Intern");
    await expect(admin.getByRole("table", { name: "Intern overview" })).toContainText("Chemical Engineering");
  });
});
