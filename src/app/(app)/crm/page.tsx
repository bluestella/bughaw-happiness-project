import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Target } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAccess } from "@/utils/supabase/access";
import { canSee, landingPath } from "@/lib/access";
import type { CrmLeadRow } from "@/lib/crm";
import { CalculatorHeader } from "@/components/CalculatorHeader";
import { CrmBoard } from "./CrmBoard";
import { LEAD_ROW_SELECT } from "./leadSelect";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Lead funnel — CRM",
  description:
    "Track hotel accounts and leads from the Bughaw Innovations marketing site through the sales pipeline.",
};

export default async function CrmPage() {
  const supabase = createClient();
  const access = await getCurrentUserAccess(supabase);
  const role = access.role;

  // Middleware already redirects anyone without the 'crm' section; this is the
  // belt-and-braces check. RLS (has_section('crm')) is the real boundary.
  if (!canSee(access, "crm")) redirect(landingPath(access));

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

      <CrmBoard initialLeads={leads} role={role} canQuote={canSee(access, "sales")} />
    </div>
  );
}
