// Database rules from 0014_crm_deal_fields.sql (docs/specs/crm-deal-fields.md),
// attempted as a member through the anon key, the way the app writes.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient } from "../../e2e/support/admin.ts";
import { clientFor } from "./actors.ts";

const db = adminClient();
let leadId = "";

const read = async () => {
  const { data, error } = await db.from("crm_leads").select("*").eq("id", leadId).single();
  if (error) throw new Error(error.message);
  return data as Record<string, unknown>;
};

beforeAll(async () => {
  const { data, error } = await db
    .from("crm_leads")
    .insert({ origin_form: "manual", status: "Qualified", description: "[access] deal rules" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  leadId = data.id as string;
});

afterAll(async () => {
  await db.from("crm_leads").delete().eq("id", leadId);
});

describe("lost reason", () => {
  it("refuses Closed Lost without a reason", async () => {
    const m = await clientFor("member");
    const { error } = await m.from("crm_leads").update({ status: "Closed Lost" }).eq("id", leadId);
    expect(error).not.toBeNull();
    expect((await read()).status).toBe("Qualified");
  });

  it("refuses a reason outside the list", async () => {
    const m = await clientFor("member");
    const { error } = await m
      .from("crm_leads")
      .update({ status: "Closed Lost", lost_reason: "because" })
      .eq("id", leadId);
    expect(error).not.toBeNull();
    expect((await read()).status).toBe("Qualified");
  });

  it("accepts Closed Lost with a reason, and clears it when the lead reopens", async () => {
    const m = await clientFor("member");
    const lost = await m
      .from("crm_leads")
      .update({ status: "Closed Lost", lost_reason: "price" })
      .eq("id", leadId);
    expect(lost.error).toBeNull();
    expect(await read()).toMatchObject({ status: "Closed Lost", lost_reason: "price" });

    const reopened = await m.from("crm_leads").update({ status: "Qualified" }).eq("id", leadId);
    expect(reopened.error).toBeNull();
    expect(await read()).toMatchObject({ status: "Qualified", lost_reason: null });
  });

  it("drops a reason sent with a status that is not lost", async () => {
    const m = await clientFor("member");
    await m.from("crm_leads").update({ lost_reason: "timing" }).eq("id", leadId);
    expect((await read()).lost_reason).toBeNull();
  });
});

describe("deal field checks", () => {
  const refused = async (patch: Record<string, unknown>) => {
    const m = await clientFor("member");
    const before = await read();
    const { error } = await m.from("crm_leads").update(patch).eq("id", leadId);
    expect(error).not.toBeNull();
    const after = await read();
    delete before.updated_at;
    delete after.updated_at;
    expect(after).toEqual(before);
  };

  it("refuses a next action without a due date", () => refused({ next_action: "Call the buyer" }));
  it("refuses a blank next action", () => refused({ next_action: "   ", next_action_due_on: "2026-11-20" }));
  it("refuses a next action over 200 characters", () =>
    refused({ next_action: "x".repeat(201), next_action_due_on: "2026-11-20" }));
  it("refuses a negative deal value", () => refused({ deal_value: -1 }));
  it("refuses sample feedback without a sent date", () => refused({ sample_feedback_on: "2026-11-05" }));
  it("refuses sample feedback before the sample was sent", () =>
    refused({ sample_sent_on: "2026-11-05", sample_feedback_on: "2026-11-04" }));

  it("accepts a complete, valid deal", async () => {
    const m = await clientFor("member");
    const patch = {
      deal_value: 125000.5,
      expected_close_on: "2026-12-15",
      next_action: "Send revised quotation",
      next_action_due_on: "2026-11-20",
      sample_sent_on: "2026-11-05",
      sample_feedback_on: "2026-11-09",
    };
    const { error } = await m.from("crm_leads").update(patch).eq("id", leadId);
    expect(error).toBeNull();
    expect(await read()).toMatchObject(patch);
  });
});

describe("buyer segment and pipeline link", () => {
  it("refuses a segment outside the list and accepts one inside it", async () => {
    const m = await clientFor("member");
    const created = await db
      .from("crm_accounts")
      .insert({ name: "[access] Segment Spa" })
      .select("id")
      .single();
    expect(created.error).toBeNull();
    const id = created.data!.id as string;
    try {
      const bad = await m.from("crm_accounts").update({ segment: "airline" }).eq("id", id);
      expect(bad.error).not.toBeNull();
      const good = await m.from("crm_accounts").update({ segment: "spa" }).eq("id", id);
      expect(good.error).toBeNull();
      const { data } = await db.from("crm_accounts").select("segment").eq("id", id).single();
      expect(data?.segment).toBe("spa");

      // Deleting the CRM account must not delete the pipeline row that points at it.
      const pipe = await db
        .from("pipeline_accounts")
        .insert({ name: "[access] Segment Spa", crm_account_id: id })
        .select("id")
        .single();
      expect(pipe.error).toBeNull();
      await db.from("crm_accounts").delete().eq("id", id);
      const after = await db
        .from("pipeline_accounts")
        .select("crm_account_id")
        .eq("id", pipe.data!.id)
        .single();
      expect(after.data?.crm_account_id).toBeNull();
      await db.from("pipeline_accounts").delete().eq("id", pipe.data!.id);
    } finally {
      await db.from("crm_accounts").delete().eq("id", id);
    }
  });
});
