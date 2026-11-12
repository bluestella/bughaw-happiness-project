import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAccess } from "@/utils/supabase/access";
import { canSee, landingPath } from "@/lib/access";

/**
 * Every finance page starts here. Middleware already redirects anyone without the
 * 'finance' section (off by default for members and contractors); RLS is the real boundary.
 */
export async function requireFinance() {
  const supabase = await createClient();
  const access = await getCurrentUserAccess(supabase);
  if (!canSee(access, "finance")) redirect(landingPath(access));
  return { supabase, role: access.role, isAdmin: access.role === "super_admin" };
}
