import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/utils/supabase/role";
import { canManageAllowlist } from "@/lib/permissions";
import { CalculatorHeader } from "@/components/CalculatorHeader";
import { AllowlistManager, type AllowedEmailRow } from "./AllowlistManager";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Allowlist — Admin",
  description: "Manage who can sign in to the Bughaw Suite.",
};

export default async function AllowlistPage() {
  const supabase = createClient();
  const role = await getCurrentUserRole(supabase);

  if (!canManageAllowlist(role)) redirect("/tasks");

  const { data, error } = await supabase.rpc("admin_list_allowed_emails");

  return (
    <div>
      <CalculatorHeader
        icon={ShieldCheck}
        eyebrow="Admin"
        title="Invite allowlist"
        description="Signups are invite-only. Add an email here before inviting that person from the Supabase dashboard, or before they try to sign in."
      />
      <AllowlistManager
        initialRows={(data as AllowedEmailRow[] | null) ?? []}
        loadError={error?.message ?? null}
      />
    </div>
  );
}
