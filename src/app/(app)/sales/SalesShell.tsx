"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ORDER_STATUS_LABELS,
  QUOTE_STATUS_LABELS,
  type OrderStatus,
  type QuoteStatus,
} from "@/lib/sales";

export function SalesTabs({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const tabs = [
    { href: "/sales/quotes", label: "Quotations" },
    { href: "/sales/orders", label: "Orders" },
    { href: "/sales/stock", label: "Stock" },
    ...(isAdmin ? [{ href: "/sales/products", label: "Products" }] : []),
  ];
  return (
    <nav aria-label="Sales" className="mb-5 flex flex-wrap gap-1.5 print:hidden">
      {tabs.map((t) => {
        const active = pathname === t.href || pathname.startsWith(t.href + "/");
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg border px-3 py-1.5 text-[13px] transition-colors ${
              active
                ? "border-coir bg-coir-bg font-semibold text-coir-dark"
                : "border-line bg-white text-ink-soft hover:text-ink"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

const BADGE = "rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide";

export function QuoteBadge({ status, expired }: { status: QuoteStatus; expired?: boolean }) {
  if (expired) return <span className={`${BADGE} border-amber/60 text-amber`}>Expired</span>;
  const tone =
    status === "accepted"
      ? "border-coir text-coir-dark"
      : status === "declined" || status === "void"
        ? "border-danger/50 text-danger"
        : status === "sent"
          ? "border-clay/50 text-clay"
          : "border-line text-ink-soft";
  return <span className={`${BADGE} ${tone}`}>{QUOTE_STATUS_LABELS[status]}</span>;
}

export function OrderBadge({ status }: { status: OrderStatus }) {
  const tone =
    status === "paid"
      ? "border-coir text-coir-dark"
      : status === "cancelled"
        ? "border-danger/50 text-danger"
        : status === "delivered"
          ? "border-clay/50 text-clay"
          : "border-line text-ink-soft";
  return <span className={`${BADGE} ${tone}`}>{ORDER_STATUS_LABELS[status]}</span>;
}

export function PrintButton() {
  return (
    <Button intent="secondary" size="sm" className="print:hidden" onClick={() => window.print()}>
      <Printer className="mr-1.5 h-3.5 w-3.5" aria-hidden />
      Print or save as PDF
    </Button>
  );
}

export function Field({
  label,
  children,
  hint,
  className,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-ink-soft">{hint}</span>}
    </label>
  );
}
