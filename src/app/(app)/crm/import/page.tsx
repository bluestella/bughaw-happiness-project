import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/utils/supabase/role";
import { canEditLead } from "@/lib/permissions";
import { ImportClient } from "./ImportClient";

export const dynamic = "force-dynamic";

export default async function CrmImportPage() {
  const supabase = createClient();
  const role = await getCurrentUserRole(supabase);
  if (!canEditLead(role)) redirect("/tasks");

  return (
    <div>
      <Link href="/crm" className="text-[12px] text-ink-soft hover:text-ink">
        ← Lead funnel
      </Link>
      <div className="mb-6 mt-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-coir">CRM</p>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Import leads</h1>
        <p className="mt-1 text-[13px] text-ink-soft">
          Backfill submissions from a spreadsheet or a JSON export. Rows are checked against the
          same rules as the website forms, and existing contacts are reused rather than duplicated.
        </p>
      </div>
      <ImportClient />
    </div>
  );
}
