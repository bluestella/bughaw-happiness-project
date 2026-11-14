"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function ProductionTabs() {
  const pathname = usePathname();
  const tabs = [
    { href: "/production", label: "Batches", exact: true },
    { href: "/production/lots", label: "Supplier lots" },
    { href: "/production/tests", label: "Material tests" },
  ];
  return (
    <nav aria-label="Production" className="mb-5 flex flex-wrap gap-1.5 print:hidden">
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

export function FieldError({ message }: { message?: string }) {
  return message ? (
    <span role="alert" className="mt-1 block text-[11px] text-danger">
      {message}
    </span>
  ) : null;
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
