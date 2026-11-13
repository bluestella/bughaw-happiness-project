import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAccess } from "@/utils/supabase/access";
import { canSee, landingPath } from "@/lib/access";

/** Every production page starts here. RLS (has_section('production')) is the real boundary. */
export async function requireProduction() {
  const supabase = await createClient();
  const access = await getCurrentUserAccess(supabase);
  if (!canSee(access, "production")) redirect(landingPath(access));
  const { data } = await supabase.auth.getUser();
  return {
    supabase,
    role: access.role,
    isAdmin: access.role === "super_admin",
    email: (data.user?.email ?? "").toLowerCase(),
  };
}
