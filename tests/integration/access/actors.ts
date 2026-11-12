// Who attempts each operation. Every actor uses the ANON key, exactly like the
// app; only the session differs.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { e2eEnv } from "../../e2e/support/env.ts";
import { PASSWORD, USERS } from "../../e2e/support/seed.ts";

export const ACTORS = ["anon", "no_role", "contractor", "member", "super_admin"] as const;
export type Actor = (typeof ACTORS)[number];

/** Signed in, but no longer on the allowlist: current_user_role() is NULL. */
export const NO_ROLE_USER = { email: "norole@test.local", password: PASSWORD };

const CREDENTIALS: Record<Exclude<Actor, "anon">, { email: string; password: string }> = {
  no_role: NO_ROLE_USER,
  contractor: USERS.contractor,
  member: USERS.member,
  super_admin: USERS.super_admin,
};

export function emailOf(actor: Exclude<Actor, "anon" | "no_role">): string {
  return CREDENTIALS[actor].email;
}

const cache = new Map<Actor, Promise<SupabaseClient>>();

async function build(actor: Actor): Promise<SupabaseClient> {
  const env = e2eEnv(); // throws unless Supabase is local
  const client = createClient(env.supabaseUrl, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  if (actor !== "anon") {
    const { error } = await client.auth.signInWithPassword(CREDENTIALS[actor]);
    if (error) throw new Error(`[access] sign in as ${actor}: ${error.message}`);
  }
  return client;
}

export function clientFor(actor: Actor): Promise<SupabaseClient> {
  let c = cache.get(actor);
  if (!c) {
    c = build(actor);
    cache.set(actor, c);
  }
  return c;
}
