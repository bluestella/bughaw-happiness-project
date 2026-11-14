import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";
import { getAccess, getSupabase, getSessionUser } from "@/lib/session";
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
  const [supabase, { role }] = await Promise.all([getSupabase(), getAccess()]);
  if (!canManageAccess(role)) redirect("/");

  const [{ data, error }, user] = await Promise.all([
    supabase.rpc("admin_get_section_access"),
    getSessionUser(),
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
        selfEmail={user?.email?.toLowerCase() ?? null}
      />
    </div>
  );
}
