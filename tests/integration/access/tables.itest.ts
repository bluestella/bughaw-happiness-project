// Runs every actor against every table and operation in matrix.ts, using the
// anon key and a real session, and checks the outcome with the service-role
// client. "Allowed" and "refused" are judged by what is in the database
// afterwards, not by the error the client saw: RLS refuses an UPDATE or DELETE
// by silently matching no rows.
import { afterEach, describe, expect, it } from "vitest";
import { adminClient } from "../../e2e/support/admin.ts";
import { ACTORS, clientFor, type Actor } from "./actors.ts";
import { TABLES, type Op, type Row, type TableCase } from "./matrix.ts";

const OPS: Op[] = ["select", "insert", "update", "delete"];
const db = adminClient();

let counter = 0;
const newTag = () => `acc${Date.now().toString(36)}${(counter++).toString(36)}`;

const pick = (row: Row, cols: string[]): Row => Object.fromEntries(cols.map((c) => [c, row[c]]));

/** Rows to remove after each test: [table, match]. Deleted in reverse order. */
let cleanup: [string, Row][] = [];

afterEach(async () => {
  for (const [table, match] of cleanup.reverse()) {
    const { error } = await db.from(table).delete().match(match);
    if (error) throw new Error(`[access] cleanup ${table}: ${error.message}`);
  }
  cleanup = [];
});

async function createParents(tc: TableCase, tag: string) {
  for (const p of tc.parents?.(tag) ?? []) {
    const { error } = await db.from(p.table).insert(p.row);
    if (error) throw new Error(`[access] parent ${p.table}: ${error.message}`);
    cleanup.push([p.table, pick(p.row, p.key)]);
  }
}

/** Service-role insert of a fixture row; returns its primary key. */
async function createFixture(tc: TableCase, tag: string): Promise<Row> {
  await createParents(tc, tag);
  const { data, error } = await db
    .from(tc.table)
    .insert({
      ...tc.make(tag),
      ...(typeof tc.adminExtra === "function" ? tc.adminExtra(tag) : tc.adminExtra),
    })
    .select()
    .single();
  if (error) throw new Error(`[access] fixture ${tc.table}: ${error.message}`);
  const key = pick(data as Row, tc.key);
  cleanup.push([tc.table, key]);
  return key;
}

async function exists(table: string, match: Row): Promise<Row | null> {
  const { data, error } = await db.from(table).select("*").match(match).maybeSingle();
  if (error) throw new Error(`[access] verify ${table}: ${error.message}`);
  return (data as Row | null) ?? null;
}

/** Performs `op` as `actor` and reports whether it took effect. */
async function attempt(tc: TableCase, op: Op, actor: Actor): Promise<boolean> {
  const client = await clientFor(actor);
  const tag = newTag();

  if (op === "insert") {
    await createParents(tc, tag);
    const row = tc.make(tag);
    const { error } = await client.from(tc.table).insert(row);
    // Find what was written by the columns we sent that are plain scalars.
    const probe = Object.fromEntries(
      Object.entries(row).filter(([, v]) => v === null || typeof v !== "object")
    );
    const { data, error: readErr } = await db.from(tc.table).select("*").match(probe);
    if (readErr) throw new Error(`[access] verify insert ${tc.table}: ${readErr.message}`);
    const written = (data ?? []) as Row[];
    for (const w of written) cleanup.push([tc.table, pick(w, tc.key)]);
    return !error && written.length > 0;
  }

  const key = await createFixture(tc, tag);

  if (op === "select") {
    const { data } = await client.from(tc.table).select("*").match(key);
    return (data ?? []).length > 0;
  }
  if (op === "update") {
    await client.from(tc.table).update(tc.patch).match(key);
    const after = await exists(tc.table, key);
    if (!after) throw new Error(`[access] ${tc.table} fixture vanished during update`);
    return Object.entries(tc.patch).every(
      ([col, value]) => JSON.stringify(after[col]) === JSON.stringify(value)
    );
  }
  // delete
  await client.from(tc.table).delete().match(key);
  return (await exists(tc.table, key)) === null;
}

for (const tc of TABLES) {
  describe(tc.name ?? tc.table, () => {
    for (const op of OPS) {
      for (const actor of ACTORS) {
        const allowed = tc.allowed[op].includes(actor);
        it(`${op} as ${actor}: ${allowed ? "allowed" : "refused"}`, async () => {
          expect(await attempt(tc, op, actor)).toBe(allowed);
        });
      }
    }
  });
}
