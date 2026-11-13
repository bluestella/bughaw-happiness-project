// The test-data rule (docs/ui-testing.md §1.1): tests leave nothing behind.
//
//   snapshot()       — before anything is seeded, record every row of every public
//                      table plus the auth user ids. That is the BASELINE.
//   restore(base)    — delete every row / auth user not in the baseline, and put
//                      back any baseline row a test changed or deleted.
//   diff(base, now)  — the leak check: what still differs after restore.
//
// Cleanup is a diff against the baseline, so it doesn't depend on tests tracking
// what they create: rows made through the UI, the ingest API, or by a test that
// crashed halfway are all removed.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ROOT } from "./env.ts";

type Row = Record<string, unknown>;

interface TableSpec {
  table: string;
  /** Primary-key columns. */
  key: string[];
  /** Columns that can't be written back (generated / identity). */
  omit?: string[];
  /** Rows can't be re-inserted (identity PK); extra rows are still deleted. */
  noRestore?: boolean;
}

// Children before parents: this is the DELETE order (restore runs it reversed).
// Every table exposed by PostgREST must be listed here or in IGNORED_RELATIONS;
// assertCoversSchema() fails the run when a migration adds an unknown table.
export const TABLES: TableSpec[] = [
  // Strategy worksheets (0022): no children.
  { table: "strategy_worksheets", key: ["id"] },
  // Finance (0020): expenses and budgets point at categories (restrict), so they go first.
  { table: "fin_expenses", key: ["id"] },
  { table: "fin_budgets", key: ["id"] },
  { table: "fin_cash_balances", key: ["id"] },
  { table: "fin_categories", key: ["id"] },
  // People (0018). Reports and logs before profiles; logs of a submitted week are locked
  // against direct deletes, so the profile (cascade) is not used to clear them: the
  // guard allows a nested delete only, so delete the report rows first, then logs.
  { table: "people_weekly_reports", key: ["id"] },
  { table: "people_daily_logs", key: ["id"] },
  { table: "people_interns", key: ["id"] },
  // Sales (0015-0017). Orders and quotations go before their lines: issued documents
  // refuse direct line deletes (that is the rule being protected), and deleting the
  // document removes its lines. Adjustments and levels go before orders and products.
  { table: "stock_adjustments", key: ["id"], noRestore: true },
  { table: "stock_levels", key: ["product_id"] },
  { table: "sales_orders", key: ["id"] },
  { table: "sales_order_lines", key: ["id"] },
  { table: "sales_quotations", key: ["id"] },
  { table: "sales_quotation_lines", key: ["id"] },
  { table: "sales_price_tiers", key: ["id"] },
  { table: "sales_products", key: ["id"] },
  { table: "sales_counters", key: ["kind", "year"] },
  { table: "business_card_events", key: ["id"], noRestore: true },
  { table: "business_cards", key: ["id"] },
  { table: "crm_lead_activities", key: ["id"] },
  { table: "crm_leads", key: ["id"] },
  { table: "crm_contacts", key: ["id"], omit: ["email_key"] },
  { table: "crm_accounts", key: ["id"], omit: ["name_key"] },
  { table: "task_comments", key: ["id"] },
  { table: "tasks", key: ["id"] },
  { table: "mini_project_contributors", key: ["mini_project_id", "user_email"] },
  { table: "mini_projects", key: ["id"] },
  { table: "project_contributors", key: ["project_id", "user_email"] },
  { table: "projects", key: ["id"] },
  { table: "saved_calculations", key: ["id"] },
  { table: "pipeline_accounts", key: ["id"] },
  { table: "app_state", key: ["key"] },
  { table: "crm_ingest_secrets", key: ["name"] },
  { table: "user_section_overrides", key: ["email", "section"] },
  { table: "role_section_defaults", key: ["role", "section"] },
  { table: "app_sections", key: ["key"] },
  { table: "allowed_emails", key: ["email"] },
  // The audit log (0019) is written by triggers on the tables above, so cleaning those
  // tables adds rows to it. It goes last, and restore() sweeps it again after step 2.
  { table: "audit_log", key: ["id"], noRestore: true },
];

/** Views and other read-only relations PostgREST exposes; nothing to clean. */
const IGNORED_RELATIONS = new Set<string>([]);

/** Columns a trigger rewrites on every write; ignored when comparing rows. */
const VOLATILE_COLUMNS = new Set(["updated_at"]);

export interface Baseline {
  takenAt: string;
  tables: Record<string, Row[]>;
  authUserIds: string[];
}

export const BASELINE_FILE = path.join(ROOT, "playwright", ".baseline.json");

const keyOf = (spec: TableSpec, row: Row) => spec.key.map((k) => String(row[k])).join("\u0000");

function stable(row: Row): string {
  const keys = Object.keys(row)
    .filter((k) => !VOLATILE_COLUMNS.has(k))
    .sort();
  return JSON.stringify(keys.map((k) => [k, row[k]]));
}

async function selectAll(db: SupabaseClient, table: string): Promise<Row[]> {
  const PAGE = 1000;
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from(table).select("*").range(from, from + PAGE - 1);
    if (error) throw new Error(`[e2e baseline] select ${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

async function listAuthUserIds(db: SupabaseClient): Promise<string[]> {
  const ids: string[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`[e2e baseline] list auth users: ${error.message}`);
    ids.push(...data.users.map((u) => u.id));
    if (data.users.length < 1000) return ids;
  }
}

/** Fails when PostgREST exposes a public relation this file doesn't know about. */
export async function assertCoversSchema(supabaseUrl: string, serviceRoleKey: string) {
  const res = await fetch(`${supabaseUrl}/rest/v1/`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  });
  if (!res.ok) throw new Error(`[e2e baseline] could not read schema: HTTP ${res.status}`);
  const spec = (await res.json()) as { definitions?: Record<string, unknown> };
  const known = new Set(TABLES.map((t) => t.table));
  const unknown = Object.keys(spec.definitions ?? {}).filter(
    (name) => !known.has(name) && !IGNORED_RELATIONS.has(name)
  );
  if (unknown.length) {
    throw new Error(
      `[e2e baseline] unknown table(s) ${unknown.join(", ")}. Add them to TABLES ` +
        "(or IGNORED_RELATIONS for views) in tests/e2e/support/baseline.ts so the " +
        "suite can clean them up (docs/ui-testing.md §1.1)."
    );
  }
}

export async function snapshot(db: SupabaseClient): Promise<Baseline> {
  const tables: Record<string, Row[]> = {};
  for (const spec of TABLES) tables[spec.table] = await selectAll(db, spec.table);
  return { takenAt: new Date().toISOString(), tables, authUserIds: await listAuthUserIds(db) };
}

export interface Leak {
  table: string;
  kind: "extra" | "missing" | "changed";
  key: string;
}

export function diff(base: Baseline, now: Baseline): Leak[] {
  const leaks: Leak[] = [];
  for (const spec of TABLES) {
    const before = new Map((base.tables[spec.table] ?? []).map((r) => [keyOf(spec, r), r]));
    const after = new Map((now.tables[spec.table] ?? []).map((r) => [keyOf(spec, r), r]));
    for (const [k, row] of after) {
      const old = before.get(k);
      if (!old) leaks.push({ table: spec.table, kind: "extra", key: k });
      else if (!spec.noRestore && stable(old) !== stable(row))
        leaks.push({ table: spec.table, kind: "changed", key: k });
    }
    if (!spec.noRestore) {
      for (const k of before.keys()) {
        if (!after.has(k)) leaks.push({ table: spec.table, kind: "missing", key: k });
      }
    }
  }
  const baseUsers = new Set(base.authUserIds);
  for (const id of now.authUserIds) {
    if (!baseUsers.has(id)) leaks.push({ table: "auth.users", kind: "extra", key: id });
  }
  return leaks;
}

async function deleteRows(db: SupabaseClient, spec: TableSpec, rows: Row[]) {
  if (!rows.length) return;
  if (spec.key.length === 1) {
    const col = spec.key[0];
    for (let i = 0; i < rows.length; i += 200) {
      const ids = rows.slice(i, i + 200).map((r) => r[col]);
      const { error } = await db.from(spec.table).delete().in(col, ids);
      if (error) throw new Error(`[e2e cleanup] delete ${spec.table}: ${error.message}`);
    }
    return;
  }
  for (const row of rows) {
    const match = Object.fromEntries(spec.key.map((k) => [k, row[k]]));
    const { error } = await db.from(spec.table).delete().match(match);
    if (error) throw new Error(`[e2e cleanup] delete ${spec.table}: ${error.message}`);
  }
}

/** Puts the database back to `base`. Returns how many rows/users it removed. */
export async function restore(db: SupabaseClient, base: Baseline): Promise<number> {
  let removed = 0;

  // 1. Delete everything that isn't in the baseline, children first.
  for (const spec of TABLES) {
    const keep = new Set((base.tables[spec.table] ?? []).map((r) => keyOf(spec, r)));
    const extra = (await selectAll(db, spec.table)).filter((r) => !keep.has(keyOf(spec, r)));
    await deleteRows(db, spec, extra);
    removed += extra.length;
  }

  // 2. Put back baseline rows a test changed or deleted, parents first.
  for (const spec of [...TABLES].reverse()) {
    if (spec.noRestore) continue;
    const current = new Map((await selectAll(db, spec.table)).map((r) => [keyOf(spec, r), r]));
    const toWrite = (base.tables[spec.table] ?? [])
      .filter((r) => {
        const now = current.get(keyOf(spec, r));
        return !now || stable(now) !== stable(r);
      })
      .map((r) => {
        const copy = { ...r };
        for (const col of spec.omit ?? []) delete copy[col];
        return copy;
      });
    if (!toWrite.length) continue;
    const { error } = await db
      .from(spec.table)
      .upsert(toWrite, { onConflict: spec.key.join(",") });
    if (error) throw new Error(`[e2e cleanup] restore ${spec.table}: ${error.message}`);
  }

  // 2b. Steps 1 and 2 changed audited tables, so the audit log has new rows too.
  const audit = TABLES.find((t) => t.table === "audit_log")!;
  const keepAudit = new Set((base.tables[audit.table] ?? []).map((r) => keyOf(audit, r)));
  const extraAudit = (await selectAll(db, audit.table)).filter((r) => !keepAudit.has(keyOf(audit, r)));
  await deleteRows(db, audit, extraAudit);

  // 3. Delete auth users created during the run.
  const baseUsers = new Set(base.authUserIds);
  for (const id of await listAuthUserIds(db)) {
    if (baseUsers.has(id)) continue;
    const { error } = await db.auth.admin.deleteUser(id);
    if (error) throw new Error(`[e2e cleanup] delete auth user ${id}: ${error.message}`);
    removed++;
  }
  return removed;
}

export function formatLeaks(leaks: Leak[]): string {
  return leaks.map((l) => `  - ${l.table}: ${l.kind} row ${l.key.replace(/\u0000/g, " / ")}`).join("\n");
}

/** restore() then the leak check. Throws, listing leftovers, if anything remains. */
export async function restoreAndVerify(db: SupabaseClient, base: Baseline): Promise<number> {
  const removed = await restore(db, base);
  const leaks = diff(base, await snapshot(db));
  if (leaks.length) {
    throw new Error(
      `[e2e] TEST DATA LEAK: ${leaks.length} difference(s) from the baseline remain after ` +
        `cleanup (docs/ui-testing.md §1.1):\n${formatLeaks(leaks)}`
    );
  }
  return removed;
}

export function saveBaseline(base: Baseline) {
  mkdirSync(path.dirname(BASELINE_FILE), { recursive: true });
  writeFileSync(BASELINE_FILE, JSON.stringify(base));
}

export function loadBaseline(): Baseline | null {
  if (!existsSync(BASELINE_FILE)) return null;
  return JSON.parse(readFileSync(BASELINE_FILE, "utf8")) as Baseline;
}

export function clearBaseline() {
  rmSync(BASELINE_FILE, { force: true });
}
