"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { CATEGORIES } from "@/lib/calculators/types";
import { calculatorsByCategory, calculatorPath } from "@/lib/calculators/registry";
import { TOOLS } from "@/lib/tools";
import { canAccessCalculators, type Role } from "@/lib/permissions";

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link
      href={href}
      className={`block rounded-md px-3 py-1.5 text-[13px] leading-snug ${
        active
          ? "bg-coir-bg text-coir-dark font-semibold"
          : "text-ink-soft hover:text-ink hover:bg-paper"
      }`}
    >
      {children}
    </Link>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-soft px-3 mt-5 mb-1.5">
      {children}
    </p>
  );
}

export function Sidebar({ role }: { role: Role | null }) {
  const [open, setOpen] = useState(false);
  const showCalculators = canAccessCalculators(role);

  const nav = (
    <nav className="pb-8">
      {showCalculators && (
        <>
          <NavLink href="/">Dashboard</NavLink>
          <NavLink href="/saved">Saved calculations</NavLink>
        </>
      )}

      <SectionLabel>Task Management</SectionLabel>
      <NavLink href="/tasks">🗂️ Projects &amp; boards</NavLink>

      {showCalculators && (
        <>
          <SectionLabel>Tools</SectionLabel>
          {TOOLS.map((t) => (
            <NavLink key={t.id} href={t.path}>
              {t.icon} {t.name}
            </NavLink>
          ))}

          {CATEGORIES.map((cat) => (
            <div key={cat.id}>
              <SectionLabel>{cat.name}</SectionLabel>
              {calculatorsByCategory(cat.id).map((c) => (
                <NavLink key={c.id} href={calculatorPath(c)}>
                  {c.icon} {c.name}
                </NavLink>
              ))}
            </div>
          ))}
        </>
      )}
    </nav>
  );

  return (
    <>
      <button
        className="lg:hidden fixed bottom-4 right-4 z-40 bg-coir text-white rounded-full w-12 h-12 shadow-lg text-xl"
        onClick={() => setOpen(!open)}
        aria-label="Toggle navigation"
      >
        ☰
      </button>
      {open && (
        <div
          className="lg:hidden fixed inset-0 bg-ink/30 z-20"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        className={`fixed lg:sticky top-0 z-30 h-screen w-64 shrink-0 overflow-y-auto border-r border-line bg-panel px-3 pt-5 transition-transform lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        onClick={() => setOpen(false)}
      >
        <Link href="/" className="block px-3 mb-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-coir-dark">
            Bughaw Innovations
          </p>
          <p className="font-display text-lg font-semibold text-ink">Calculators Hub</p>
        </Link>
        {nav}
      </aside>
    </>
  );
}
