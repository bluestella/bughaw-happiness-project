import { redirect } from "next/navigation";
import { getAccess, getSupabase } from "@/lib/session";
import { canSee, landingPath } from "@/lib/access";

/** Every strategy page starts here. RLS (has_section('strategy')) is the real boundary. */
export async function requireStrategy() {
  const [supabase, access] = await Promise.all([getSupabase(), getAccess()]);
  if (!canSee(access, "strategy")) redirect(landingPath(access));
  return { supabase, role: access.role, isAdmin: access.role === "super_admin" };
}
