import { redirect } from "next/navigation";
import { getAccess, getSupabase } from "@/lib/session";
import { canSee, landingPath } from "@/lib/access";

/**
 * Every finance page starts here. Middleware already redirects anyone without the
 * 'finance' section (off by default for members and contractors); RLS is the real boundary.
 */
export async function requireFinance() {
  const [supabase, access] = await Promise.all([getSupabase(), getAccess()]);
  if (!canSee(access, "finance")) redirect(landingPath(access));
  return { supabase, role: access.role, isAdmin: access.role === "super_admin" };
}
