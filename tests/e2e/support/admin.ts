// TEST-ONLY service-role client. The app itself never sees this key (AGENTS.md
// §5): it lives in the gitignored .env.e2e, is never passed to the Next.js
// server, and src/** is lint-blocked from importing tests/**. env.ts has
// already refused any non-local Supabase URL by the time this runs.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { e2eEnv } from "./env.ts";

let client: SupabaseClient | null = null;

export function adminClient(): SupabaseClient {
  if (client) return client;
  const env = e2eEnv();
  client = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
