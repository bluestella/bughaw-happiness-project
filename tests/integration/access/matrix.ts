// The access matrix: for every table, who may SELECT / INSERT / UPDATE / DELETE.
//
// This is the proof behind docs/standards/database.md §10: a table is not done
// until it has a row here. coverage.itest.ts fails when the database exposes a
// table that is missing from this file, so a new migration cannot skip it.
//
// Each list names the actors that are ALLOWED. Every other actor must be refused.
// Expectations describe the seeded role defaults (member: everything; contractor:
// task boards only). Row-level rules that depend on who owns a row are in
// scoped.itest.ts.
import { createHash } from "node:crypto";
import { FIXTURES, SIGNOUT_USER, USERS } from "../../e2e/support/seed.ts";
import type { Actor } from "./actors.ts";

export type Row = Record<string, unknown>;
export type Op = "select" | "insert" | "update" | "delete";

export interface TableCase {
  /** Label shown in test names; defaults to `table`. */
  name?: string;
  table: string;
  /** Primary-key columns. */
  key: string[];
  /** A valid new row. `tag` is unique per attempt. */
  make: (tag: string) => Row;
  /** Extra columns only the service-role fixture insert needs (JWT-derived defaults). */
  adminExtra?: Row | ((tag: string) => Row);
  /** A harmless change to a non-key column. */
  patch: Row;
  /**
   * The parents already create this row (a trigger does), so the fixture is read
   * rather than inserted.
   */
  autoCreated?: boolean;
  /** Rows the fixture depends on; created before and deleted after each attempt. */
  parents?: (tag: string) => { table: string; key: string[]; row: Row }[];
  allowed: Record<Op, readonly Actor[]>;
}

/** A valid UUID derived from a test tag, so `parents` and `make` agree on ids. */
export const uuidFor = (tag: string, n: number): string => {
  const h = createHash("md5").update(`${tag}:${n}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

const categoryParent = (t: string) => ({
  table: "fin_categories", key: ["id"], row: { id: uuidFor(t, 4), name: `[access] category ${t}` },
});
const allowedEmailParent = (t: string) => ({
  table: "allowed_emails", key: ["email"], row: { email: `${t}@test.local`, note: "access test", role: "member" },
});
/** Today in Manila as YYYY-MM-DD. */
const manilaToday = (): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const mondayOf = (iso: string): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};
const accountParent = (t: string) => ({
  table: "crm_accounts", key: ["id"], row: { id: uuidFor(t, 1), name: `[access] account ${t}` },
});
const productParent = (t: string) => ({
  table: "sales_products", key: ["id"], row: { id: uuidFor(t, 2), sku: `sku-${t}`, name: `[access] product ${t}` },
});

const NOBODY: readonly Actor[] = [];
const ADMIN: readonly Actor[] = ["super_admin"];
/** Seeded defaults give members every section and contractors none of these. */
const TEAM: readonly Actor[] = ["member", "super_admin"];
/** Contributors on the fixture project: the member and the contractor. */
const BOARD: readonly Actor[] = ["contractor", "member", "super_admin"];

const all = (who: readonly Actor[]): Record<Op, readonly Actor[]> => ({
  select: who, insert: who, update: who, delete: who,
});
const adminEmail = USERS.super_admin.email;

export const TABLES: TableCase[] = [
  // --- Service-role only: RLS on, no policies ---------------------------------
  {
    table: "allowed_emails", key: ["email"],
    make: (t) => ({ email: `${t}@test.local`, note: "access test", role: "member" }),
    patch: { note: "changed" },
    allowed: all(NOBODY),
  },
  {
    table: "crm_ingest_secrets", key: ["name"],
    make: (t) => ({ name: t, secret_hash: "a".repeat(64) }),
    patch: { max_per_minute: 7 },
    allowed: all(NOBODY),
  },
  {
    table: "crm_ingest_rate", key: ["name", "window_start"],
    make: () => ({ name: "e2e", window_start: "2000-01-01T00:00:00Z", n: 1 }),
    patch: { n: 2 },
    allowed: all(NOBODY),
  },
  {
    table: "app_sections", key: ["key"],
    make: (t) => ({ key: t, label: "Access test", group_label: "Sections" }),
    patch: { label: "changed" },
    allowed: all(NOBODY),
  },
  {
    table: "role_section_defaults", key: ["role", "section"],
    parents: (t) => [{ table: "app_sections", key: ["key"], row: { key: t, label: "Access test", group_label: "Sections" } }],
    make: (t) => ({ role: "contractor", section: t, allowed: false }),
    patch: { allowed: true },
    allowed: all(NOBODY),
  },
  {
    // Uses the sign-out user so no actor's own access changes mid-run.
    table: "user_section_overrides", key: ["email", "section"],
    parents: (t) => [{ table: "app_sections", key: ["key"], row: { key: t, label: "Access test", group_label: "Sections" } }],
    make: (t) => ({ email: SIGNOUT_USER.email, section: t, allowed: false }),
    patch: { allowed: true },
    allowed: all(NOBODY),
  },

  // --- Shared workspace --------------------------------------------------------
  {
    name: "app_state (key mapped to a tool)", table: "app_state", key: ["key"],
    make: () => ({ key: "cost-calc", value: { accessTest: true } }),
    patch: { value: { accessTest: "changed" } },
    allowed: { select: TEAM, insert: TEAM, update: TEAM, delete: ADMIN },
  },
  {
    name: "app_state (unmapped key)", table: "app_state", key: ["key"],
    make: (t) => ({ key: `unmapped-${t}`, value: { accessTest: true } }),
    patch: { value: { accessTest: "changed" } },
    allowed: all(ADMIN),
  },
  {
    table: "pipeline_accounts", key: ["id"],
    make: (t) => ({ name: `[access] ${t}` }),
    patch: { notes: "changed" },
    allowed: { select: TEAM, insert: TEAM, update: TEAM, delete: ADMIN },
  },
  {
    table: "saved_calculations", key: ["id"],
    make: (t) => ({ calculator_id: "cogs", label: `[access] ${t}`, inputs: {}, outputs: {} }),
    patch: { label: "changed" },
    allowed: { select: TEAM, insert: TEAM, update: TEAM, delete: ADMIN },
  },

  // --- CRM ---------------------------------------------------------------------
  {
    table: "crm_accounts", key: ["id"],
    make: (t) => ({ name: `[access] ${t}` }),
    patch: { industry: "changed" },
    allowed: { select: TEAM, insert: TEAM, update: TEAM, delete: ADMIN },
  },
  {
    table: "crm_contacts", key: ["id"],
    make: (t) => ({ email: `${t}@lead.test`, full_name: `[access] ${t}` }),
    patch: { full_name: "changed" },
    allowed: { select: TEAM, insert: TEAM, update: TEAM, delete: ADMIN },
  },
  {
    table: "crm_leads", key: ["id"],
    make: (t) => ({ origin_form: "manual", description: `[access] ${t}` }),
    patch: { description: "changed" },
    allowed: { select: TEAM, insert: TEAM, update: TEAM, delete: ADMIN },
  },
  {
    // Append-only by design.
    table: "crm_lead_activities", key: ["id"],
    make: (t) => ({ lead_id: FIXTURES.leads[0].id, kind: "note", body: `[access] ${t}` }),
    patch: { body: "changed" },
    allowed: { select: TEAM, insert: TEAM, update: NOBODY, delete: NOBODY },
  },

  // --- Digital cards -----------------------------------------------------------
  {
    table: "business_cards", key: ["id"],
    make: (t) => ({ full_name: `[access] ${t}` }),
    // The token default calls generate_card_token(), which service_role cannot run.
    adminExtra: (t) => ({ token: `Tok${t}`.slice(-12), created_by_email: adminEmail }),
    patch: { job_title: "changed" },
    allowed: all(ADMIN),
  },
  {
    // Written only by record_card_event().
    table: "business_card_events", key: ["id"],
    make: () => ({ card_id: FIXTURES.publishedCard.id, event: "view" }),
    patch: { event: "click" },
    allowed: { select: ADMIN, insert: NOBODY, update: NOBODY, delete: NOBODY },
  },

  // --- Sales (0015-0017) -------------------------------------------------------
  {
    table: "sales_products", key: ["id"],
    make: (t) => ({ sku: `sku-${t}`, name: `[access] ${t}` }),
    patch: { description: "changed" },
    allowed: { select: TEAM, insert: ADMIN, update: ADMIN, delete: NOBODY },
  },
  {
    table: "sales_price_tiers", key: ["id"],
    parents: (t) => [productParent(t)],
    make: (t) => ({ product_id: uuidFor(t, 2), min_qty: 10, unit_price: 100 }),
    patch: { unit_price: 99 },
    allowed: { select: TEAM, insert: ADMIN, update: ADMIN, delete: ADMIN },
  },
  {
    // Written only by stock_adjust() and the order triggers.
    table: "stock_levels", key: ["product_id"],
    autoCreated: true,
    parents: (t) => [productParent(t)],
    make: (t) => ({ product_id: uuidFor(t, 2) }),
    patch: { on_hand: 5 },
    allowed: { select: TEAM, insert: NOBODY, update: NOBODY, delete: NOBODY },
  },
  {
    // Append-only history, written only by stock_adjust() and the order triggers.
    table: "stock_adjustments", key: ["id"],
    parents: (t) => [productParent(t)],
    make: (t) => ({ product_id: uuidFor(t, 2), delta: 5, reason: "correction" }),
    patch: { delta: 6 },
    allowed: { select: TEAM, insert: NOBODY, update: NOBODY, delete: NOBODY },
  },
  {
    // Reached only through sales_next_number().
    table: "sales_counters", key: ["kind", "year"],
    make: () => ({ kind: "quotation", year: 1999 }),
    patch: { last_no: 5 },
    allowed: all(NOBODY),
  },
  {
    table: "sales_quotations", key: ["id"],
    parents: (t) => [accountParent(t)],
    make: (t) => ({ account_id: uuidFor(t, 1) }),
    patch: { notes: "changed" },
    allowed: { select: TEAM, insert: TEAM, update: TEAM, delete: NOBODY },
  },
  {
    table: "sales_quotation_lines", key: ["id"],
    parents: (t) => [
      accountParent(t),
      productParent(t),
      { table: "sales_quotations", key: ["id"], row: { id: uuidFor(t, 3), account_id: uuidFor(t, 1) } },
    ],
    make: (t) => ({ quotation_id: uuidFor(t, 3), product_id: uuidFor(t, 2), qty: 2, unit_price: 100 }),
    patch: { qty: 3 },
    allowed: all(TEAM),
  },
  {
    table: "sales_orders", key: ["id"],
    parents: (t) => [accountParent(t)],
    make: (t) => ({ account_id: uuidFor(t, 1) }),
    patch: { notes: "changed" },
    allowed: { select: TEAM, insert: TEAM, update: TEAM, delete: NOBODY },
  },
  {
    table: "sales_order_lines", key: ["id"],
    parents: (t) => [
      accountParent(t),
      productParent(t),
      { table: "sales_orders", key: ["id"], row: { id: uuidFor(t, 3), account_id: uuidFor(t, 1) } },
    ],
    make: (t) => ({ order_id: uuidFor(t, 3), product_id: uuidFor(t, 2), qty: 2, unit_price: 100 }),
    patch: { qty: 3 },
    allowed: all(TEAM),
  },

  // --- People (0018) --------------------------------------------------------------
  {
    // A profile for someone who is not any actor, so only a super_admin may see it.
    table: "people_interns", key: ["id"],
    parents: (t) => [allowedEmailParent(t)],
    make: (t) => ({ email: `${t}@test.local`, discipline: "marketing" }),
    patch: { school: "changed" },
    allowed: { select: ADMIN, insert: ADMIN, update: ADMIN, delete: NOBODY },
  },
  {
    // Rows of someone else: only a super_admin sees or writes them. The intern and
    // supervisor cases are in people-rules.itest.ts.
    table: "people_daily_logs", key: ["id"],
    parents: (t) => [allowedEmailParent(t)],
    make: (t) => ({ intern_email: `${t}@test.local`, work_date: manilaToday(), hours: 2, summary: "[access] log" }),
    patch: { hours: 3 },
    allowed: { select: ADMIN, insert: ADMIN, update: ADMIN, delete: ADMIN },
  },
  {
    // A super_admin may create a report for an intern but never write its text.
    table: "people_weekly_reports", key: ["id"],
    parents: (t) => [allowedEmailParent(t)],
    make: (t) => ({ intern_email: `${t}@test.local`, week_start: mondayOf(manilaToday()) }),
    patch: { accomplishments: "changed" },
    allowed: { select: ADMIN, insert: ADMIN, update: NOBODY, delete: NOBODY },
  },

<<<<<<< HEAD
  // --- Strategy worksheets (0022): the `strategy` section; members yes by default -----
  {
    table: "strategy_worksheets", key: ["id"],
    make: (t) => ({ kind: "rice", title: `[access] ${t}`, data: { items: [] } }),
    patch: { title: "[access] changed" },
    allowed: { select: TEAM, insert: TEAM, update: TEAM, delete: ADMIN },
  },
=======
  // --- Production and R&D (0023): the `production` section; members yes by default ----
  {
    table: "supplier_lots", key: ["id"],
    make: (t) => ({ lot_no: `lot-${t}`, supplier: "[access] supplier", material: "Coir", received_on: manilaToday(), quantity: 10 }),
    patch: { unit: "m" },
    allowed: { select: TEAM, insert: TEAM, update: TEAM, delete: ADMIN },
  },
  {
    table: "production_batches", key: ["id"],
    parents: (t) => [productParent(t)],
    make: (t) => ({ batch_no: `b-${t}`, product_id: uuidFor(t, 2), made_on: manilaToday(), qty_made: 10, qty_rejected: 1 }),
    patch: { notes: "changed" },
    allowed: { select: TEAM, insert: TEAM, update: TEAM, delete: ADMIN },
  },
  {
    // The service-role fixture is created by nobody, so only a super_admin may edit it; a member
    // editing their own test is proved in production-rules.itest.ts.
    table: "material_tests", key: ["id"],
    make: () => ({ tested_on: manilaToday(), material: "Coir", test_name: "Tear", result: "ok", outcome: "pass" }),
    patch: { notes: "changed" },
    allowed: { select: TEAM, insert: TEAM, update: ADMIN, delete: ADMIN },
  },
>>>>>>> origin/main
  // --- Finance (0020): off by default for members and contractors -----------------
  {
    table: "fin_categories", key: ["id"],
    make: (t) => ({ name: `[access] ${t}` }),
    patch: { is_active: false },
    allowed: { select: ADMIN, insert: ADMIN, update: ADMIN, delete: NOBODY },
  },
  {
    table: "fin_expenses", key: ["id"],
    parents: (t) => [categoryParent(t)],
    make: (t) => ({ spent_on: manilaToday(), amount: 100, category_id: uuidFor(t, 4), description: "[access] expense" }),
    patch: { vendor: "changed" },
    allowed: { select: ADMIN, insert: ADMIN, update: ADMIN, delete: NOBODY },
  },
  {
    table: "fin_cash_balances", key: ["id"],
    make: () => ({ as_of: manilaToday(), amount: 1000 }),
    patch: { amount: 2000 },
    allowed: { select: ADMIN, insert: ADMIN, update: ADMIN, delete: NOBODY },
  },
  {
    table: "fin_budgets", key: ["id"],
    parents: (t) => [categoryParent(t)],
    make: (t) => ({ month_start: `${manilaToday().slice(0, 7)}-01`, category_id: uuidFor(t, 4), amount: 500 }),
    patch: { amount: 600 },
    allowed: { select: ADMIN, insert: ADMIN, update: ADMIN, delete: NOBODY },
  },

  // --- Audit log (0019) -----------------------------------------------------------
  {
    // Written only by triggers; read only by a super_admin; nobody edits history.
    table: "audit_log", key: ["id"],
    make: (t) => ({ table_name: `access_${t}`, op: "INSERT", changes: {} }),
    patch: { table_name: "changed" },
    allowed: { select: ADMIN, insert: NOBODY, update: NOBODY, delete: NOBODY },
  },

  // --- Task management (rows inside the fixture project) -----------------------
  {
    // A new project has no contributors, so only a super_admin sees it.
    table: "projects", key: ["id"],
    make: (t) => ({ name: `[access] ${t}` }),
    adminExtra: { created_by_email: adminEmail },
    patch: { name: "[access] changed" },
    allowed: all(ADMIN),
  },
  {
    table: "mini_projects", key: ["id"],
    make: (t) => ({ project_id: FIXTURES.project.id, name: `[access] ${t}` }),
    adminExtra: { created_by_email: adminEmail },
    patch: { name: "[access] changed" },
    allowed: { select: BOARD, insert: TEAM, update: TEAM, delete: ADMIN },
  },
  {
    table: "project_contributors", key: ["project_id", "user_email"],
    // New grants must name someone on the invite list (0019).
    parents: (t) => [allowedEmailParent(t)],
    make: (t) => ({ project_id: FIXTURES.project.id, user_email: `${t}@test.local` }),
    adminExtra: { added_by_email: adminEmail },
    patch: { added_by_email: "changed@test.local" },
    allowed: { select: BOARD, insert: TEAM, update: NOBODY, delete: ADMIN },
  },
  {
    table: "mini_project_contributors", key: ["mini_project_id", "user_email"],
    // New grants must name someone on the invite list (0019).
    parents: (t) => [allowedEmailParent(t)],
    make: (t) => ({ mini_project_id: FIXTURES.miniProject.id, user_email: `${t}@test.local` }),
    adminExtra: { added_by_email: adminEmail },
    patch: { added_by_email: "changed@test.local" },
    allowed: { select: BOARD, insert: TEAM, update: NOBODY, delete: ADMIN },
  },
  {
    // The fixture row is created by the super_admin, so the contractor's
    // "own tasks only" rule refuses update and delete here.
    table: "tasks", key: ["id"],
    make: (t) => ({ mini_project_id: FIXTURES.miniProject.id, title: `[access] ${t}` }),
    adminExtra: { created_by_email: adminEmail },
    patch: { title: "[access] changed" },
    allowed: { select: BOARD, insert: BOARD, update: TEAM, delete: TEAM },
  },
  {
    // Append-only by design.
    table: "task_comments", key: ["id"],
    make: (t) => ({ task_id: FIXTURES.memberTask.id, body: `[access] ${t}` }),
    adminExtra: { author_email: adminEmail },
    patch: { body: "changed" },
    allowed: { select: BOARD, insert: BOARD, update: NOBODY, delete: NOBODY },
  },
];
