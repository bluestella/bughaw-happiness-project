import type { Metadata } from "next";
import { Boxes } from "lucide-react";
import { CalculatorHeader } from "@/components/CalculatorHeader";
import { requireSales } from "../access";
import { SalesTabs } from "../SalesShell";
import { StockClient, type AdjustmentRow, type StockProduct } from "./StockClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Stock — Sales" };

export default async function StockPage() {
  const { supabase, role } = await requireSales();
  const [products, history] = await Promise.all([
    supabase
      .from("sales_products")
      .select("id, sku, name, unit, is_active, stock_levels(on_hand, reserved)")
      .order("name"),
    supabase
      .from("stock_adjustments")
      .select("id, product_id, delta, reason, note, sales_order_id, created_at, created_by_email, sales_products(name)")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  return (
    <div>
      <CalculatorHeader
        icon={Boxes}
        eyebrow="Sales"
        title="Stock"
        description="Finished pairs on hand, how many are promised to confirmed orders, and what is free to sell."
      />
      <SalesTabs isAdmin={role === "super_admin"} />
      {(products.error || history.error) && (
        <p className="mb-4 rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-[13px] text-danger">
          Could not load stock: {(products.error ?? history.error)?.message}
        </p>
      )}
      <StockClient
        products={(products.data ?? []) as unknown as StockProduct[]}
        history={(history.data ?? []) as unknown as AdjustmentRow[]}
        isAdmin={role === "super_admin"}
      />
    </div>
  );
}
