import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { CostReport } from "./CostReport";

export const metadata: Metadata = { title: "Unit cost report" };

/** Server wrapper: resolves "Prepared by" from the signed-in account. */
export default async function CostReportPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const meta = (user?.user_metadata ?? {}) as { full_name?: unknown; name?: unknown };
  const name = typeof meta.full_name === "string" ? meta.full_name : typeof meta.name === "string" ? meta.name : "";
  const preparedBy = name && user?.email ? `${name} (${user.email})` : name || user?.email || "";

  return <CostReport preparedBy={preparedBy} />;
}
