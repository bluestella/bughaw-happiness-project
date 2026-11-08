import type { SupabaseClient } from "@supabase/supabase-js";
import { NO_ACCESS, legacyAccess, parseAccess, type Access } from "@/lib/access";

/**
 * Role + visible sections in one RPC (0010_section_access.sql). If that RPC
 * fails (most likely 0010 has not been run on this database yet), fall back to
 * the role-only rules so admins and members are not locked out.
 */
export async function getCurrentUserAccess(supabase: SupabaseClient): Promise<Access> {
  const { data, error } = await supabase.rpc("current_user_access");
  if (!error) return data ? parseAccess(data) : NO_ACCESS;

  const { data: role, error: roleError } = await supabase.rpc("current_user_role");
  if (roleError) return NO_ACCESS;
  if (process.env.NODE_ENV !== "production") {
    console.warn(
      "[access] current_user_access() failed (%s) — using role-only rules. Run supabase/migrations/0010_section_access.sql.",
      error.message
    );
  }
  return legacyAccess(role);
}
