"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Menu, X } from "lucide-react";
import { TOOLS } from "@/lib/tools";
import { getIcon } from "@/lib/icons";
import { canAccessCalculators, canAccessCrm, type Role } from "@/lib/permissions";
import { CommandPalette } from "@/components/CommandPalette";

function NavLink({
  href,
  iconKey,
  children,
  onNavigate,
  pathname,
}: {
  href: string;
  iconKey: string;
  children: React.ReactNode;
  onNavigate?: () => void;
  pathname: string;
}) {
  const active = pathname === href;
  const Icon = getIcon(iconKey);
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 lg:py-1.5 text-[13px] leading-snug transition-colors duration-150 ${
        active
          ? "bg-coir-bg text-coir-dark font-semibold"
          : "text-ink-soft hover:text-ink hover:bg-paper"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
      <span className="truncate">{children}</span>
    </Link>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-soft px-3 mt-6 mb-1.5">
      {children}
    </p>
  );
}

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 min-w-0">
      <Image
        src="/brand/logo-mark.png"
        alt=""
        width={28}
        height={28}
        priority
        className="shrink-0"
      />
      <div className="min-w-0">
        <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-soft leading-none mb-0.5">
          Bughaw Innovations
        </p>
        <p className="text-[15px] font-semibold text-ink leading-tight truncate">
          Bughaw Suite
        </p>
      </div>
    </Link>
  );
}

export function Sidebar({ role, email }: { role: Role | null; email?: string | null }) {
  const [open, setOpen] = useState(false);
  const showCalculators = canAccessCalculators(role);
  const showCrm = canAccessCrm(role);
  const pathname = usePathname();
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const nav = useMemo(() => {
    const primaryItems: Array<{ href: string; iconKey: string; label: string }> = [
      { href: "/", iconKey: "dashboard", label: "Dashboard" },
    ];
    if (showCalculators) {
      primaryItems.push(
        { href: "/calculators", iconKey: "calculators", label: "Calculators" },
        { href: "/saved", iconKey: "saved", label: "Saved calculations" }
      );
    }

    function renderNav(onNavigate?: () => void) {
      return (
        <nav className="pb-8">
          <CommandPalette showCalculators={showCalculators} showCrm={showCrm} />

          {primaryItems.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              iconKey={item.iconKey}
              onNavigate={onNavigate}
              pathname={pathname}
            >
              {item.label}
            </NavLink>
          ))}

          {showCrm && (
            <>
              <SectionLabel>CRM</SectionLabel>
              <NavLink href="/crm" iconKey="crm" onNavigate={onNavigate} pathname={pathname}>
                Lead funnel
              </NavLink>
              <NavLink
                href="/crm/import"
                iconKey="crm-import"
                onNavigate={onNavigate}
                pathname={pathname}
              >
                Import leads
              </NavLink>
            </>
          )}

          <SectionLabel>Task Management</SectionLabel>
          <NavLink href="/tasks" iconKey="tasks" onNavigate={onNavigate} pathname={pathname}>
            Projects &amp; boards
          </NavLink>

          {showCalculators && (
            <>
              <SectionLabel>Tools</SectionLabel>
              {TOOLS.map((t) => (
                <NavLink
                  key={t.id}
                  href={t.path}
                  iconKey={t.icon}
                  onNavigate={onNavigate}
                  pathname={pathname}
                >
                  {t.name}
                </NavLink>
              ))}
            </>
          )}
        </nav>
      );
    }
    return renderNav;
  }, [showCalculators, showCrm, pathname]);

  return (
    <>
      {/* Mobile top app bar */}
      <header className="lg:hidden sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-panel/90 px-4 backdrop-blur">
        <button
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
          aria-expanded={open}
          className="-ml-1 flex h-9 w-9 items-center justify-center rounded-lg text-ink transition-colors hover:bg-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-coir/30"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
        <Logo />
      </header>

      {/* Mobile drawer backdrop */}
      <div
        aria-hidden
        onClick={close}
        className={`lg:hidden fixed inset-0 z-40 bg-ink/40 transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* Drawer (mobile) / sidebar (desktop) */}
      <aside
        aria-label="Main navigation"
        className={`fixed lg:sticky top-0 z-50 lg:z-auto flex h-dvh lg:h-screen w-72 lg:w-64 shrink-0 flex-col border-r border-line bg-panel transition-transform duration-300 ease-out-strong motion-reduce:transition-none lg:translate-x-0 ${
          open ? "translate-x-0 shadow-pop lg:shadow-none" : "-translate-x-full"
        }`}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4 lg:border-b-0 lg:pt-5 lg:pb-2">
          <Logo />
          <button
            onClick={close}
            aria-label="Close navigation"
            className="lg:hidden flex h-9 w-9 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-paper hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-coir/30"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-2">{nav(close)}</div>

        {/* Mobile-only account footer (desktop shows this in the top header) */}
        <div className="lg:hidden shrink-0 border-t border-line px-4 py-3">
          {email && <p className="mb-2 truncate text-[11px] text-ink-soft">{email}</p>}
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-xs font-semibold text-ink shadow-card transition-colors hover:border-ink-soft"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
