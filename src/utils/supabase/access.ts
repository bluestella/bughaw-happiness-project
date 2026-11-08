import type { SupabaseClient } from "@supabase/supabase-js";
import { NO_ACCESS, parseAccess, type Access } from "@/lib/access";

/** Role + visible sections in one RPC (0010_section_access.sql). */
export async function getCurrentUserAccess(supabase: SupabaseClient): Promise<Access> {
  const { data, error } = await supabase.rpc("current_user_access");
  if (error || !data) return NO_ACCESS;
  return parseAccess(data);
}
