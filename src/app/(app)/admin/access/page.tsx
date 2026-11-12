import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/utils/supabase/role";
import { canManageAccess } from "@/lib/permissions";
import { CalculatorHeader } from "@/components/CalculatorHeader";
import { AccessManager, type AccessSnapshot } from "./AccessManager";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Page access — Admin",
  description: "Choose which sections and tools each person can see.",
};

const EMPTY: AccessSnapshot = { sections: [], defaults: [], overrides: [], people: [] };

export default async function AccessPage() {
  const supabase = await createClient();
  const role = await getCurrentUserRole(supabase);
  if (!canManageAccess(role)) redirect("/");

  const [{ data, error }, { data: userData }] = await Promise.all([
    supabase.rpc("admin_get_section_access"),
    supabase.auth.getUser(),
  ]);

  return (
    <div>
      <CalculatorHeader
        icon={KeyRound}
        eyebrow="Admin"
        title="Page access"
        description="Each role starts from a default set of sections. Override any section for one person. The database enforces these rules on the data as well as hiding the pages."
      />
      <AccessManager
        initial={(data as AccessSnapshot | null) ?? EMPTY}
        loadError={error?.message ?? null}
        selfEmail={userData.user?.email?.toLowerCase() ?? null}
      />
    </div>
  );
}
