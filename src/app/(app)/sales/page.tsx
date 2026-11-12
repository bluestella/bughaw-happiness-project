import { redirect } from "next/navigation";
import { requireSales } from "./access";

export default async function SalesIndex() {
  await requireSales();
  redirect("/sales/quotes");
}
