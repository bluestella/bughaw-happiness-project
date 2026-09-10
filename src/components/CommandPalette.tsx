"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { TOOLS } from "@/lib/tools";
import { ALL_CALCULATORS, calculatorPath } from "@/lib/calculators/registry";
import { getIcon } from "@/lib/icons";
import { DialogBackdrop } from "@/components/ui/dialog";
import { cn } from "@/lib/cn";

interface PaletteItem {
  href: string;
  label: string;
  description: string;
  group: string;
  iconKey: string;
}

function buildItems(showCalculators: boolean, showCrm: boolean): PaletteItem[] {
  const items: PaletteItem[] = [
    { href: "/", label: "Dashboard", description: "Home — featured tools & shortcuts", group: "Go to", iconKey: "dashboard" },
  ];
  if (showCalculators) {
    items.push(
      { href: "/calculators", label: "Calculators", description: "Full catalog, filterable by category", group: "Go to", iconKey: "calculators" },
      { href: "/saved", label: "Saved calculations", description: "Team-wide snapshots", group: "Go to", iconKey: "saved" }
    );
  }
  if (showCrm) {
    items.push(
      { href: "/crm", label: "Lead funnel", description: "CRM pipeline", group: "Go to", iconKey: "crm" },
      { href: "/crm/import", label: "Import leads", description: "Bring leads into the CRM", group: "Go to", iconKey: "crm-import" }
    );
  }
  items.push({ href: "/tasks", label: "Projects & boards", description: "Task management", group: "Go to", iconKey: "tasks" });

  if (showCalculators) {
    for (const t of TOOLS) {
      items.push({ href: t.path, label: t.name, description: t.description, group: "Tools", iconKey: t.icon });
    }
    for (const c of ALL_CALCULATORS) {
      items.push({
        href: calculatorPath(c),
        label: c.name,
        description: c.description,
        group: "Calculators",
        iconKey: c.icon,
      });
    }
  }
  return items;
}

export function CommandPalette({
  showCalculators,
  showCrm,
}: {
  showCalculators: boolean;
  showCrm: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const items = useMemo(() => buildItems(showCalculators, showCrm), [showCalculators, showCrm]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.label.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q) ||
        i.group.toLowerCase().includes(q)
    );
  }, [items, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function navigate(item: PaletteItem) {
    setOpen(false);
    setQuery("");
    router.push(item.href);
  }

  function onListKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (filtered.length ? (i + 1) % filtered.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (filtered.length ? (i - 1 + filtered.length) % filtered.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = filtered[activeIndex];
      if (item) navigate(item);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-2 flex w-full items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-left text-xs text-ink-soft transition-colors hover:border-ink-soft hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-coir/30"
      >
        <Search className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
        <span className="flex-1">Search…</span>
        <kbd className="rounded border border-line bg-paper px-1.5 py-0.5 font-mono text-[10px] text-ink-soft">
          ⌘K
        </kbd>
      </button>

      <BaseDialog.Root
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery("");
        }}
      >
        <BaseDialog.Portal>
          <DialogBackdrop />
          <BaseDialog.Popup
            initialFocus={inputRef}
            className={cn(
              "fixed left-1/2 top-[15%] z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2",
              "rounded-xl border border-line bg-panel shadow-pop",
              "origin-top transition-[opacity,transform] duration-200 ease-out-strong",
              "data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0",
              "data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[ending-style]:duration-150",
              "motion-reduce:data-[starting-style]:scale-100 motion-reduce:data-[ending-style]:scale-100"
            )}
          >
            <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
              <Search className="h-4 w-4 shrink-0 text-ink-soft" strokeWidth={1.75} aria-hidden />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onListKeyDown}
                placeholder="Search calculators, tools, and pages…"
                aria-label="Search calculators, tools, and pages"
                aria-controls="command-listbox"
                className="w-full bg-transparent text-sm text-ink placeholder:text-ink-soft focus:outline-none"
              />
            </div>
            <div id="command-listbox" role="listbox" className="max-h-[60vh] overflow-y-auto py-2">
              {filtered.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-ink-soft">No matches.</p>
              ) : (
                filtered.map((item, i) => {
                  const Icon = getIcon(item.iconKey);
                  const active = i === activeIndex;
                  return (
                    <button
                      key={item.group + item.href}
                      role="option"
                      aria-selected={active}
                      type="button"
                      onMouseEnter={() => setActiveIndex(i)}
                      onClick={() => navigate(item)}
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors",
                        active ? "bg-coir-bg" : "hover:bg-paper"
                      )}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white text-coir-dark">
                        <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-ink">
                          {item.label}
                        </span>
                        <span className="block truncate text-xs text-ink-soft">
                          {item.description}
                        </span>
                      </span>
                      <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-soft">
                        {item.group}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </BaseDialog.Popup>
        </BaseDialog.Portal>
      </BaseDialog.Root>
    </>
  );
}
