import { redirect } from "next/navigation";
import { Target } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/utils/supabase/role";
import { canAccessCrm } from "@/lib/permissions";
import type { CrmLeadRow } from "@/lib/crm";
import { CalculatorHeader } from "@/components/CalculatorHeader";
import { CrmBoard } from "./CrmBoard";
import { LEAD_ROW_SELECT } from "./leadSelect";

export const dynamic = "force-dynamic";

export default async function CrmPage() {
  const supabase = createClient();
  const role = await getCurrentUserRole(supabase);

  // Middleware already redirects contractors; this is the belt-and-braces check
  // for anyone the middleware misses. RLS is the real boundary.
  if (!canAccessCrm(role)) redirect("/tasks");

  const { data, error } = await supabase
    .from("crm_leads")
    .select(LEAD_ROW_SELECT)
    .order("position", { ascending: true });

  const leads = (data ?? []) as unknown as CrmLeadRow[];

  return (
    <div>
      <CalculatorHeader
        icon={Target}
        eyebrow="CRM"
        title="Lead funnel"
        description="Every submission from bughawinnovations.ph, plus anything added by hand."
      />

      {error && (
        <p className="mb-4 rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-[13px] text-danger">
          Could not load leads: {error.message}
        </p>
      )}

      <CrmBoard initialLeads={leads} role={role} />
    </div>
  );
}
