import type { Metadata } from "next";
import { getSessionUser } from "@/lib/session";
import { CostReport } from "./CostReport";

export const metadata: Metadata = { title: "Unit cost report" };

/** Server wrapper: resolves "Prepared by" from the signed-in account. */
export default async function CostReportPage() {
  const user = await getSessionUser();
  const meta = (user?.metadata ?? {}) as { full_name?: unknown; name?: unknown };
  const name = typeof meta.full_name === "string" ? meta.full_name : typeof meta.name === "string" ? meta.name : "";
  const preparedBy = name && user?.email ? `${name} (${user.email})` : name || user?.email || "";

  return <CostReport preparedBy={preparedBy} />;
}
