// Loads .env.e2e (written by scripts/e2e/env.sh from `supabase status`) and
// enforces the first half of the test-data rule (docs/ui-testing.md §1.1):
// the suite only ever talks to a LOCAL Supabase. There is deliberately no
// override flag.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// npm scripts and Playwright always run from the repo root. (No __dirname: this file
// is also run directly by Node's TypeScript support for `npm run e2e:clean`.)
export const ROOT = process.cwd();
const ENV_FILE = path.join(ROOT, ".env.e2e");

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

function parseEnvFile(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let value = m[2];
    if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
    out[m[1]] = value;
  }
  return out;
}

/** Throws unless `url` is an http(s) URL on a loopback host. Exported for reuse. */
export function assertLocalUrl(url: string | undefined, name: string): string {
  if (!url) {
    throw new Error(
      `[e2e] ${name} is not set. Run \`npm run e2e:db\` to start local Supabase and write .env.e2e.`
    );
  }
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error(`[e2e] ${name} is not a valid URL: ${url}`);
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `[e2e] REFUSING TO RUN: ${name}=${url} is not a local Supabase. ` +
        "E2E tests may only touch the throwaway local stack (docs/ui-testing.md §1.1)."
    );
  }
  return url;
}

function load() {
  const file = existsSync(ENV_FILE) ? parseEnvFile(ENV_FILE) : {};
  const get = (k: string) => file[k] ?? process.env[k];

  const supabaseUrl = assertLocalUrl(get("NEXT_PUBLIC_SUPABASE_URL"), "NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = get("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceRoleKey = get("SUPABASE_SERVICE_ROLE_KEY");
  if (!anonKey || !serviceRoleKey) {
    throw new Error("[e2e] .env.e2e is missing keys. Re-run `npm run e2e:db`.");
  }
  const baseURL = get("E2E_BASE_URL") ?? "http://localhost:3100";
  assertLocalUrl(baseURL, "E2E_BASE_URL");

  return {
    supabaseUrl,
    anonKey,
    serviceRoleKey,
    baseURL,
    ingestSecret: get("E2E_INGEST_SECRET") ?? "e2e-ingest-secret",
  };
}

let cached: ReturnType<typeof load> | null = null;
export function e2eEnv() {
  return (cached ??= load());
}

/** Env vars handed to the Next.js server the tests drive (no service-role key). */
export function appServerEnv(): Record<string, string> {
  const env = e2eEnv();
  return {
    NEXT_PUBLIC_SUPABASE_URL: env.supabaseUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: env.anonKey,
    NEXT_PUBLIC_SITE_URL: env.baseURL,
  };
}
