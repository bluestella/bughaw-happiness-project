import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAccess } from "@/utils/supabase/access";
import { canSee, landingPath } from "@/lib/access";

/** Every strategy page starts here. RLS (has_section('strategy')) is the real boundary. */
export async function requireStrategy() {
  const supabase = await createClient();
  const access = await getCurrentUserAccess(supabase);
  if (!canSee(access, "strategy")) redirect(landingPath(access));
  return { supabase, role: access.role, isAdmin: access.role === "super_admin" };
}
