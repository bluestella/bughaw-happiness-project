"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function FinanceTabs() {
  const pathname = usePathname();
  const tabs = [
    { href: "/finance", label: "Overview", exact: true },
    { href: "/finance/expenses", label: "Expenses" },
    { href: "/finance/budget", label: "Budget" },
  ];
  return (
    <nav aria-label="Finance" className="mb-5 flex flex-wrap gap-1.5 print:hidden">
      {tabs.map((t) => {
        const active = t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(t.href + "/");
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg border px-3 py-1.5 text-[13px] transition-colors ${
              active ? "border-coir bg-coir-bg font-semibold text-coir-dark" : "border-line bg-white text-ink-soft hover:text-ink"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Previous / next month links for a page that takes ?month=YYYY-MM-01. */
export function MonthNav({ base, month, prev, next, label }: { base: string; month: string; prev: string; next: string; label: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2" data-month={month}>
      <Link href={`${base}?month=${prev}`} aria-label="Previous month" className="rounded-lg border border-line bg-white px-3 py-1.5 text-[13px] hover:border-ink-soft">
        ← Previous
      </Link>
      <p className="text-[13px] font-semibold text-ink">{label}</p>
      <Link href={`${base}?month=${next}`} aria-label="Next month" className="rounded-lg border border-line bg-white px-3 py-1.5 text-[13px] hover:border-ink-soft">
        Next →
      </Link>
    </div>
  );
}
