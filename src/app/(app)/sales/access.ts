import { redirect } from "next/navigation";
import { getAccess, getSessionUser, getSupabase } from "@/lib/session";
import { canSee, landingPath } from "@/lib/access";

/**
 * Every sales page starts here. Middleware already redirects anyone without the
 * 'sales' section; this is the belt-and-braces check. RLS (has_section('sales'))
 * is the real boundary.
 */
export async function requireSales() {
  const [supabase, access, user] = await Promise.all([getSupabase(), getAccess(), getSessionUser()]);
  if (!canSee(access, "sales")) redirect(landingPath(access));
  return { supabase, access, role: access.role, email: user?.email ?? null, canSeeCrm: canSee(access, "crm") };
}
