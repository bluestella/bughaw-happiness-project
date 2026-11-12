import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Package } from "lucide-react";
import { CalculatorHeader } from "@/components/CalculatorHeader";
import type { ProductRow } from "@/lib/sales";
import { requireSales } from "../access";
import { SalesTabs } from "../SalesShell";
import { ProductsClient } from "./ProductsClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Products — Sales" };

export default async function ProductsPage() {
  const { supabase, role } = await requireSales();
  // Only a super_admin edits the catalogue (RLS enforces it; this just saves the trip).
  if (role !== "super_admin") redirect("/sales/quotes");

  const { data, error } = await supabase
    .from("sales_products")
    .select("id, sku, name, unit, description, is_active, sales_price_tiers(id, min_qty, unit_price)")
    .order("name");

  return (
    <div>
      <CalculatorHeader
        icon={Package}
        eyebrow="Sales"
        title="Products"
        description="What you sell and the price for each order size. Quotations suggest the price from these tiers."
      />
      <SalesTabs isAdmin />
      {error && (
        <p className="mb-4 rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-[13px] text-danger">
          Could not load products: {error.message}
        </p>
      )}
      <ProductsClient products={(data ?? []) as unknown as ProductRow[]} />
    </div>
  );
}
