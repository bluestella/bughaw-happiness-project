// The merge gate from docs/standards/database.md §10: a table or function that
// exists in the database but has no access test fails the run.
import { describe, expect, it } from "vitest";
import { e2eEnv } from "../../e2e/support/env.ts";
import { FUNCTIONS } from "./function-list.ts";
import { TABLES } from "./matrix.ts";

async function openApi() {
  const env = e2eEnv();
  const res = await fetch(`${env.supabaseUrl}/rest/v1/`, {
    headers: { apikey: env.serviceRoleKey, Authorization: `Bearer ${env.serviceRoleKey}` },
  });
  if (!res.ok) throw new Error(`could not read schema: HTTP ${res.status}`);
  return (await res.json()) as {
    definitions?: Record<string, unknown>;
    paths?: Record<string, unknown>;
  };
}

describe("coverage", () => {
  it("every table has a row in the access matrix", async () => {
    const spec = await openApi();
    const covered = new Set(TABLES.map((t) => t.table));
    expect(Object.keys(spec.definitions ?? {}).length).toBeGreaterThan(0);
    const missing = Object.keys(spec.definitions ?? {}).filter((t) => !covered.has(t));
    expect(missing, `add these tables to tests/integration/access/matrix.ts`).toEqual([]);
  });

  it("the matrix names no table that does not exist", async () => {
    const spec = await openApi();
    const real = new Set(Object.keys(spec.definitions ?? {}));
    expect(TABLES.map((t) => t.table).filter((t) => !real.has(t))).toEqual([]);
  });

  it("every function has an access test", async () => {
    const spec = await openApi();
    const exposed = Object.keys(spec.paths ?? {})
      .filter((p) => p.startsWith("/rpc/"))
      .map((p) => p.slice("/rpc/".length));
    expect(exposed.length, "PostgREST listed no functions; the check would be empty").toBeGreaterThan(0);
    const missing = exposed.filter((fn) => !(fn in FUNCTIONS));
    expect(missing, `add these functions to tests/integration/access/functions.itest.ts`).toEqual([]);
  });
});
