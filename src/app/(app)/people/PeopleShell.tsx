"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReportStatus } from "@/lib/people";
import { REPORT_STATUS_LABELS } from "@/lib/people";

export function PeopleTabs({ hasOwn, reviewer, isAdmin }: { hasOwn: boolean; reviewer: boolean; isAdmin: boolean }) {
  const pathname = usePathname();
  const tabs = [
    ...(hasOwn
      ? [
          { href: "/people/my-log", label: "My log" },
          { href: "/people/my-reports", label: "My reports" },
        ]
      : []),
    ...(reviewer
      ? [
          { href: "/people/review", label: "Review" },
          { href: "/people/overview", label: "Overview" },
        ]
      : []),
    ...(hasOwn || reviewer ? [{ href: "/people/evaluations", label: "Evaluations" }] : []),
    ...(isAdmin
      ? [
          { href: "/people/criteria", label: "Criteria" },
          { href: "/people/interns", label: "Interns" },
        ]
      : []),
  ];
  return (
    <nav aria-label="People" className="mb-5 flex flex-wrap gap-1.5 print:hidden">
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

export function ReportBadge({ status }: { status: ReportStatus | null }) {
  if (!status) return <span className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">No report</span>;
  const tone =
    status === "approved"
      ? "border-coir text-coir-dark"
      : status === "returned"
        ? "border-danger/50 text-danger"
        : status === "submitted"
          ? "border-clay/50 text-clay"
          : "border-line text-ink-soft";
  return (
    <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${tone}`}>
      {REPORT_STATUS_LABELS[status]}
    </span>
  );
}
