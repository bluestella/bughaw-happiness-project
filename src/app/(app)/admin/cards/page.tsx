import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { IdCard } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/utils/supabase/role";
import { canManageCards } from "@/lib/permissions";
import { CalculatorHeader } from "@/components/CalculatorHeader";
import type { BusinessCard, RollupRow } from "@/lib/cards";
import { appleWalletConfig, googleWalletConfig } from "@/lib/wallet";
import { CardsAdmin } from "./CardsAdmin";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Digital cards — Admin",
  description: "Create, publish and measure Bughaw digital business cards.",
};

/** Longest analytics window offered in the UI; the rollup is fetched once. */
const ROLLUP_DAYS = 90;

export default async function CardsAdminPage() {
  const supabase = createClient();
  const role = await getCurrentUserRole(supabase);
  if (!canManageCards(role)) redirect("/tasks");

  const [cardsRes, rollupRes] = await Promise.all([
    supabase.from("business_cards").select("*").order("full_name"),
    supabase.rpc("admin_card_event_rollup", { p_days: ROLLUP_DAYS }),
  ]);

  return (
    <div>
      <CalculatorHeader
        icon={IdCard}
        eyebrow="Admin"
        title="Digital business cards"
        description="Cards are private drafts until you publish them. A published card is public to anyone holding its link or QR code — and nothing else in the Suite is."
      />
      <CardsAdmin
        initialCards={(cardsRes.data as BusinessCard[] | null) ?? []}
        rollup={(rollupRes.data as RollupRow[] | null) ?? []}
        loadError={cardsRes.error?.message ?? rollupRes.error?.message ?? null}
        wallet={{ apple: appleWalletConfig() !== null, google: googleWalletConfig() !== null }}
      />
    </div>
  );
}
