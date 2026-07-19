import type { SupabaseClient } from "@supabase/supabase-js";
import type { Role } from "@/lib/permissions";

export async function getCurrentUserRole(
  supabase: SupabaseClient
): Promise<Role | null> {
  const { data, error } = await supabase.rpc("current_user_role");
  if (error || !data) return null;
  return data as Role;
}
