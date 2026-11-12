// Every database function callable through the API, attempted by every actor.
// Admin functions must refuse anonymous, role-less, contractor and member
// callers AND leave the data unchanged. The role-less caller is the case the
// 0008 bug missed (docs/security.md §5.8).
import { describe, expect, it } from "vitest";
import { adminClient } from "../../e2e/support/admin.ts";
import { e2eEnv } from "../../e2e/support/env.ts";
import { FIXTURES, USERS } from "../../e2e/support/seed.ts";
import { clientFor, type Actor } from "./actors.ts";

const db = adminClient();
const NON_ADMINS: Actor[] = ["anon", "no_role", "contractor", "member"];

interface Guarded {
  fn: string;
  args: Record<string, unknown>;
  /** Returns a value that must be identical before and after a refused call. */
  state: () => Promise<unknown>;
}

const one = async (table: string, match: Record<string, unknown>) =>
  (await db.from(table).select("*").match(match).maybeSingle()).data ?? null;

const MUTATING: Guarded[] = [
  {
    fn: "admin_add_allowed_email",
    args: { p_email: "intruder@test.local", p_note: "x", p_role: "super_admin" },
    state: () => one("allowed_emails", { email: "intruder@test.local" }),
  },
  {
    fn: "admin_remove_allowed_email",
    args: { p_email: USERS.member.email },
    state: () => one("allowed_emails", { email: USERS.member.email }),
  },
  {
    fn: "admin_set_allowed_role",
    args: { p_email: USERS.contractor.email, p_role: "super_admin" },
    state: () => one("allowed_emails", { email: USERS.contractor.email }),
  },
  {
    fn: "admin_delete_lead",
    args: { p_lead_id: FIXTURES.leads[0].id },
    state: () => one("crm_leads", { id: FIXTURES.leads[0].id }),
  },
  {
    fn: "admin_rotate_card_token",
    args: { p_card_id: FIXTURES.publishedCard.id },
    state: () => one("business_cards", { id: FIXTURES.publishedCard.id }),
  },
  {
    fn: "admin_set_user_section",
    args: { p_email: USERS.contractor.email, p_section: "crm", p_allowed: true },
    state: () => one("user_section_overrides", { email: USERS.contractor.email, section: "crm" }),
  },
  {
    fn: "admin_set_role_section_default",
    args: { p_role: "contractor", p_section: "crm", p_allowed: true },
    state: () => one("role_section_defaults", { role: "contractor", section: "crm" }),
  },
];

const READ_ONLY: { fn: string; args: Record<string, unknown> }[] = [
  { fn: "admin_list_allowed_emails", args: {} },
  { fn: "admin_get_section_access", args: {} },
  { fn: "admin_card_event_rollup", args: { p_days: 30 } },
];

describe("admin functions refuse everyone but a super_admin", () => {
  for (const g of MUTATING) {
    for (const actor of NON_ADMINS) {
      it(`${g.fn} as ${actor}: refused, nothing changed`, async () => {
        const before = await g.state();
        const { error } = await (await clientFor(actor)).rpc(g.fn, g.args);
        expect(error).not.toBeNull();
        expect(await g.state()).toEqual(before);
      });
    }
  }
  for (const r of READ_ONLY) {
    for (const actor of NON_ADMINS) {
      it(`${r.fn} as ${actor}: refused, returns no data`, async () => {
        const { data, error } = await (await clientFor(actor)).rpc(r.fn, r.args);
        expect(error).not.toBeNull();
        expect(data).toBeNull();
      });
    }
    it(`${r.fn} as super_admin: allowed`, async () => {
      const { error } = await (await clientFor("super_admin")).rpc(r.fn, r.args);
      expect(error).toBeNull();
    });
  }
});

describe("current_user_access", () => {
  const read = async (actor: Actor) => (await clientFor(actor)).rpc("current_user_access");

  it("anonymous callers are refused", async () => {
    expect((await read("anon")).error).not.toBeNull();
  });
  it("a signed-in user with no role gets no role and no sections", async () => {
    const { data } = await read("no_role");
    expect(data).toEqual({ role: null, sections: [] });
  });
  it("contractor gets task boards only", async () => {
    const { data } = await read("contractor");
    expect(data).toEqual({ role: "contractor", sections: ["tasks"] });
  });
  it("member gets the CRM, boards and calculators", async () => {
    const { data } = await read("member");
    expect(data.role).toBe("member");
    expect(data.sections).toEqual(expect.arrayContaining(["crm", "tasks", "calculators", "saved"]));
  });
  it("super_admin gets every section", async () => {
    const { data } = await read("super_admin");
    const { count } = await db.from("app_sections").select("*", { count: "exact", head: true });
    expect(data.role).toBe("super_admin");
    expect(data.sections).toHaveLength(count ?? -1);
  });
});

describe("directory", () => {
  it("anonymous callers cannot list the team", async () => {
    const { data, error } = await (await clientFor("anon")).rpc("list_team_directory");
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });
  it("never exposes roles", async () => {
    const { data } = await (await clientFor("member")).rpc("list_team_directory");
    expect((data ?? []).length).toBeGreaterThan(0);
    for (const row of data ?? []) expect(Object.keys(row).sort()).toEqual(["email", "note"]);
  });
  // KNOWN GAP (reported 2026-11-12, not fixed): list_team_directory() has no role
  // check, so a signed-in user who was removed from the allowlist can still read
  // every invited email and note until their session expires. When a migration
  // adds the guard, flip this expectation to "refused".
  it("KNOWN GAP: a signed-in user with no role can still list the team", async () => {
    const { data, error } = await (await clientFor("no_role")).rpc("list_team_directory");
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
  });
});

describe("anonymous callers and internal helpers", () => {
  it("generate_card_token is refused", async () => {
    const { error } = await (await clientFor("anon")).rpc("generate_card_token");
    expect(error).not.toBeNull();
  });
  it("has_section is refused", async () => {
    const { error } = await (await clientFor("anon")).rpc("has_section", { p_section: "crm" });
    expect(error).not.toBeNull();
  });
  it("project access helpers answer false", async () => {
    const anon = await clientFor("anon");
    const a = await anon.rpc("has_project_access", { p_project_id: FIXTURES.project.id });
    const b = await anon.rpc("has_mini_project_access", { p_mini_project_id: FIXTURES.miniProject.id });
    expect(a.data ?? false).toBe(false);
    expect(b.data ?? false).toBe(false);
  });
});

describe("public card", () => {
  it("returns a published card to an anonymous visitor", async () => {
    const { data, error } = await (await clientFor("anon")).rpc("get_public_card", {
      p_token: FIXTURES.publishedCard.token,
    });
    expect(error).toBeNull();
    expect(JSON.stringify(data)).toContain(FIXTURES.publishedCard.name);
  });
  it("returns nothing for a draft card or an unknown token", async () => {
    const anon = await clientFor("anon");
    for (const token of [FIXTURES.draftCard.token, FIXTURES.rotatedAwayToken]) {
      const { data } = await anon.rpc("get_public_card", { p_token: token });
      expect(JSON.stringify(data ?? null)).not.toContain(FIXTURES.draftCard.name);
      expect(Array.isArray(data) ? data.length : data ? 1 : 0).toBe(0);
    }
  });
  it("never returns admin-only columns", async () => {
    const { data } = await (await clientFor("anon")).rpc("get_public_card", {
      p_token: FIXTURES.publishedCard.token,
    });
    const text = JSON.stringify(data);
    for (const hidden of ["created_by_email", "owner_email", USERS.super_admin.email]) {
      expect(text).not.toContain(hidden);
    }
  });
  it("record_card_event ignores a draft card", async () => {
    const count = async () =>
      (await db.from("business_card_events").select("*", { count: "exact", head: true })
        .eq("card_id", FIXTURES.draftCard.id)).count;
    const before = await count();
    await (await clientFor("anon")).rpc("record_card_event", {
      p_token: FIXTURES.draftCard.token, p_event: "view", p_target: null, p_source: "link", p_device: "mobile",
    });
    expect(await count()).toBe(before);
  });
});

describe("ingest", () => {
  const payload = { form: "contact", name: "[access] Ingest", email: "access-ingest@lead.test", message: "x" };
  const leads = async () =>
    (await db.from("crm_contacts").select("*", { count: "exact", head: true })
      .eq("email", payload.email)).count;

  it("a wrong secret writes nothing", async () => {
    const before = await leads();
    await (await clientFor("anon")).rpc("ingest_form_submission", {
      p_secret: "not-the-secret", p_payload: payload,
    });
    expect(await leads()).toBe(before);
  });
  it("an empty secret writes nothing", async () => {
    const before = await leads();
    await (await clientFor("anon")).rpc("ingest_form_submission", { p_secret: "", p_payload: payload });
    expect(await leads()).toBe(before);
  });
  it("the test secret is the local one", () => {
    expect(e2eEnv().ingestSecret).toBe("e2e-ingest-secret");
  });
});
