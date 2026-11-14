import { redirect } from "next/navigation";
import { getAccess, getSessionUser, getSupabase } from "@/lib/session";
import { canSee, landingPath } from "@/lib/access";

/** Every production page starts here. RLS (has_section('production')) is the real boundary. */
export async function requireProduction() {
  const [supabase, access, user] = await Promise.all([getSupabase(), getAccess(), getSessionUser()]);
  if (!canSee(access, "production")) redirect(landingPath(access));
  return {
    supabase,
    role: access.role,
    isAdmin: access.role === "super_admin",
    email: (user?.email ?? "").toLowerCase(),
  };
}
