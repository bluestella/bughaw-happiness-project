import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAccess } from "@/utils/supabase/access";
import { canSee, landingPath } from "@/lib/access";
import { INTERN_COLUMNS, type InternRow } from "@/lib/people";

/**
 * Every people page starts here. Middleware already redirects anyone without the
 * 'people' section; RLS is the real boundary (an intern reads only their own rows, a
 * supervisor their interns', a super_admin all). The profiles this person can read
 * tell us which role they play here.
 */
export async function requirePeople() {
  const supabase = createClient();
  const access = await getCurrentUserAccess(supabase);
  if (!canSee(access, "people")) redirect(landingPath(access));
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = (user?.email ?? "").toLowerCase();
  const { data } = await supabase.from("people_interns").select(INTERN_COLUMNS).order("full_name");
  const profiles = (data ?? []) as unknown as InternRow[];
  const isAdmin = access.role === "super_admin";
  const own = profiles.find((p) => p.email.toLowerCase() === email && p.is_active) ?? null;
  const supervised = profiles.filter((p) => (p.supervisor_email ?? "").toLowerCase() === email);
  return {
    supabase,
    role: access.role,
    email,
    profiles,
    own,
    supervised,
    isAdmin,
    /** Can review reports: a supervisor of someone, or a super_admin. */
    reviewer: isAdmin || supervised.length > 0,
  };
}
