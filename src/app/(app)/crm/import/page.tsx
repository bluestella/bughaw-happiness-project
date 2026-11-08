import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Inbox } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAccess } from "@/utils/supabase/access";
import { canSee, landingPath } from "@/lib/access";
import { CalculatorHeader } from "@/components/CalculatorHeader";
import { ImportClient } from "./ImportClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Import leads — CRM",
  description:
    "Backfill CRM leads from CSV or JSON exports. Existing contacts are reused rather than duplicated.",
};

export default async function CrmImportPage() {
  const supabase = createClient();
  const access = await getCurrentUserAccess(supabase);
  if (!canSee(access, "crm")) redirect(landingPath(access));

  return (
    <div>
      <Link href="/crm" className="text-[12px] text-ink-soft hover:text-ink">
        ← Lead funnel
      </Link>
      <CalculatorHeader
        className="mt-2"
        icon={Inbox}
        eyebrow="CRM"
        title="Import leads"
        description="Backfill submissions from a spreadsheet or a JSON export. Rows are checked against the same rules as the website forms, and existing contacts are reused rather than duplicated."
      />
      <ImportClient />
    </div>
  );
}
