// Rules from 0021: the ingest secret is stored only as a hash, and the only function open to
// anonymous callers refuses a secret that has used up its per-minute allowance.
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient } from "../../e2e/support/admin.ts";
import { clientFor } from "./actors.ts";

const db = adminClient();
const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

const NAME = "access-rate";
const SECRET = "access-rate-secret-with-plenty-of-entropy";
const EMAIL = "access-ingest-rate@lead.test";
const payload = { form: "contact", name: "[access] Rate", email: EMAIL, message: "x" };

async function ingest(secret: string) {
  return (await clientFor("anon")).rpc("ingest_form_submission", { p_secret: secret, p_payload: payload });
}
const windowStart = () => {
  const d = new Date();
  d.setSeconds(0, 0);
  return d.toISOString();
};
/** Counters are per calendar minute; do not straddle a boundary mid-test. */
async function awayFromMinuteEnd() {
  const s = new Date().getSeconds();
  if (s >= 54) await new Promise((r) => setTimeout(r, (61 - s) * 1000));
}
async function leadCount(): Promise<number> {
  const { data: c } = await db.from("crm_contacts").select("id").eq("email", EMAIL);
  const ids = (c ?? []).map((r) => r.id as string);
  if (ids.length === 0) return 0;
  const { count } = await db.from("crm_leads").select("*", { count: "exact", head: true }).in("contact_id", ids);
  return count ?? 0;
}
async function cleanLeads() {
  const { data: c } = await db.from("crm_contacts").select("id").eq("email", EMAIL);
  const ids = (c ?? []).map((r) => r.id as string);
  if (ids.length) {
    await db.from("crm_leads").delete().in("contact_id", ids);
    await db.from("crm_contacts").delete().in("id", ids);
  }
}
async function setLimit(max: number, used: number) {
  await db.from("crm_ingest_rate").delete().eq("name", NAME);
  await db.from("crm_ingest_secrets").update({ max_per_minute: max }).eq("name", NAME);
  if (used > 0) await db.from("crm_ingest_rate").insert({ name: NAME, window_start: windowStart(), n: used });
}

beforeAll(async () => {
  await db.from("crm_ingest_secrets").delete().eq("name", NAME);
  const { error } = await db.from("crm_ingest_secrets")
    .insert({ name: NAME, secret_hash: sha256(SECRET), max_per_minute: 2 });
  if (error) throw new Error(`secret fixture: ${error.message}`);
  await cleanLeads();
});
afterAll(async () => {
  await cleanLeads();
  await db.from("crm_ingest_secrets").delete().eq("name", NAME); // counters cascade
});

describe("the stored secret", () => {
  it("is a hash; the plaintext column is gone", async () => {
    const { data } = await db.from("crm_ingest_secrets").select("*").eq("name", NAME).single();
    expect(data).not.toBeNull();
    expect(Object.keys(data as object)).not.toContain("secret");
    expect((data as { secret_hash: string }).secret_hash).toBe(sha256(SECRET));
  });
  it("refuses anything that is not a 64-character hex hash", async () => {
    const { error } = await db.from("crm_ingest_secrets").insert({ name: `${NAME}-bad`, secret_hash: "plain-text" });
    expect(error).not.toBeNull();
  });
  it("the local e2e secret still authenticates", async () => {
    const { data } = await db.from("crm_ingest_secrets").select("secret_hash").eq("name", "e2e").single();
    expect((data as { secret_hash: string }).secret_hash).toBe(sha256("e2e-ingest-secret"));
  });
});

describe("authentication", () => {
  it("rejects the hash itself (the stored value is not a credential)", async () => {
    await awayFromMinuteEnd();
    await setLimit(5, 0);
    const before = await leadCount();
    const { error } = await ingest(sha256(SECRET));
    expect(error?.message).toContain("unauthorized");
    expect(await leadCount()).toBe(before);
  });
  it("rejects a wrong or empty secret with nothing written", async () => {
    const before = await leadCount();
    for (const s of ["wrong", "", SECRET.toUpperCase()]) {
      const { error } = await ingest(s);
      expect(error?.message, `secret "${s}"`).toContain("unauthorized");
    }
    expect(await leadCount()).toBe(before);
  });
  it("a refused secret does not use up the allowance of a real one", async () => {
    await awayFromMinuteEnd();
    await setLimit(2, 0);
    for (let i = 0; i < 5; i++) await ingest("wrong");
    const { count } = await db.from("crm_ingest_rate").select("*", { count: "exact", head: true }).eq("name", NAME);
    expect(count).toBe(0);
  });
});

describe("rate limit", () => {
  it("accepts calls up to the limit, then refuses with 54000 and writes nothing", async () => {
    await awayFromMinuteEnd();
    await cleanLeads();
    await setLimit(2, 0);
    expect((await ingest(SECRET)).error).toBeNull();
    expect((await ingest(SECRET)).error).toBeNull();
    const refused = await ingest(SECRET);
    expect(refused.error?.code).toBe("54000");
    expect(refused.error?.message).toContain("rate limit");
    // Two contacts' worth of calls share one email, so one contact and two leads.
    expect(await leadCount()).toBe(2);
    const { data } = await db.from("crm_ingest_rate").select("n").eq("name", NAME);
    expect(data?.[0]?.n).toBe(2); // the refused call did not count
  });
  it("a different secret has its own allowance", async () => {
    await awayFromMinuteEnd();
    await setLimit(2, 2); // NAME is full
    const { error } = await ingest("e2e-ingest-secret");
    expect(error).toBeNull();
    await cleanLeads();
  });
  it("one call under the limit still works, the next does not", async () => {
    await awayFromMinuteEnd();
    await cleanLeads();
    await setLimit(3, 2);
    expect((await ingest(SECRET)).error).toBeNull();
    expect((await ingest(SECRET)).error?.code).toBe("54000");
  });
  it("a limit is honoured per secret row", async () => {
    await awayFromMinuteEnd();
    await setLimit(1, 1);
    expect((await ingest(SECRET)).error?.code).toBe("54000");
    const bad = await db.from("crm_ingest_secrets").update({ max_per_minute: 0 }).eq("name", NAME);
    expect(bad.error).not.toBeNull(); // check (max_per_minute >= 1)
  });
  it("deleting a secret removes its counters", async () => {
    await db.from("crm_ingest_secrets").insert({ name: `${NAME}-tmp`, secret_hash: "b".repeat(64) });
    await db.from("crm_ingest_rate").insert({ name: `${NAME}-tmp`, window_start: windowStart(), n: 1 });
    await db.from("crm_ingest_secrets").delete().eq("name", `${NAME}-tmp`);
    const { count } = await db.from("crm_ingest_rate").select("*", { count: "exact", head: true }).eq("name", `${NAME}-tmp`);
    expect(count).toBe(0);
  });
});
