import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/utils/supabase/role";
import { canAccessCrm } from "@/lib/permissions";
import type { CrmLeadRow } from "@/lib/crm";
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
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-coir">CRM</p>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Lead funnel</h1>
          <p className="mt-1 text-[13px] text-ink-soft">
            Every submission from bughawinnovations.ph, plus anything added by hand.
          </p>
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-[13px] text-danger">
          Could not load leads: {error.message}
        </p>
      )}

      <CrmBoard initialLeads={leads} role={role} />
    </div>
  );
}
