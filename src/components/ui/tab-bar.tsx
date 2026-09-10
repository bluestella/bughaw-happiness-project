"use client";

import { cn } from "@/lib/cn";

export type TabItem<T extends string = string> = { id: T; label: string };

function tabId(baseId: string, tab: string) {
  return `${baseId}-tab-${tab}`;
}

function panelId(baseId: string, tab: string) {
  return `${baseId}-panel-${tab}`;
}

/**
 * Segmented tab row used by the pipeline/funding tools, CRM board, and calculator catalog.
 *
 * Accessibility (WCAG 1.3.1, 4.1.2):
 * - Each tab has `role="tab"`, `aria-selected`, `aria-controls` pointing at its panel, and `id`.
 * - Pair with `<TabPanel idBase value />` which renders `role="tabpanel"` with matching
 *   `aria-labelledby` and `id`. Only the active panel is visible to AT and rendered.
 *
 * The `idBase` prop should be stable and unique per TabBar instance on the page.
 * If omitted, a deterministic base is derived from the first tab id — but providing
 * `idBase` is recommended for nested TabBars (e.g. pipeline's econ sub-tabs).
 */
export function TabBar<T extends string>({
  tabs,
  value,
  onChange,
  className,
  idBase,
}: {
  tabs: readonly TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
  /** Stable identifier used to link tabs ↔ panels. Must be unique per TabBar on the page. */
  idBase?: string;
}) {
  const base = idBase ?? `tabs-${String(tabs[0]?.id ?? "default")}`;

  function onKey(e: React.KeyboardEvent<HTMLButtonElement>, idx: number) {
    let nextIdx = -1;
    switch (e.key) {
      case "ArrowRight":
        nextIdx = (idx + 1) % tabs.length;
        break;
      case "ArrowLeft":
        nextIdx = (idx - 1 + tabs.length) % tabs.length;
        break;
      case "Home":
        nextIdx = 0;
        break;
      case "End":
        nextIdx = tabs.length - 1;
        break;
    }
    if (nextIdx >= 0) {
      e.preventDefault();
      const next = tabs[nextIdx];
      onChange(next.id);
      const el = document.getElementById(tabId(base, String(next.id)));
      (el as HTMLElement | null)?.focus();
    }
  }

  return (
    <div
      role="tablist"
      aria-label={idBase ? undefined : "Tabs"}
      className={cn(
        "inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-line bg-paper p-1",
        className
      )}
    >
      {tabs.map((t, idx) => {
        const active = t.id === value;
        const tabStr = String(t.id);
        return (
          <button
            key={t.id}
            id={tabId(base, tabStr)}
            role="tab"
            type="button"
            aria-selected={active}
            aria-controls={panelId(base, tabStr)}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKey(e, idx)}
            className={cn(
              "whitespace-nowrap rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition-colors duration-150",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-coir/30",
              active
                ? "bg-white text-ink shadow-card"
                : "text-ink-soft hover:text-ink"
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Accessible tabpanel container paired with `<TabBar />`.
 * Only the active panel is rendered and focusable; inactive panels are hidden with `hidden`.
 *
 * Usage:
 *   <TabBar idBase="main" tabs={tabs} value={tab} onChange={setTab} />
 *   <TabPanel idBase="main" value="a">…</TabPanel>
 *   <TabPanel idBase="main" value="b">…</TabPanel>
 */
export function TabPanel<T extends string>({
  idBase,
  value,
  current,
  children,
  className,
}: {
  idBase: string;
  /** The panel's own tab id. */
  value: T;
  /** The currently-active tab id (from state). */
  current: T;
  children: React.ReactNode;
  className?: string;
}) {
  const active = value === current;
  const tabStr = String(value);
  return (
    <div
      id={panelId(idBase, tabStr)}
      role="tabpanel"
      aria-labelledby={tabId(idBase, tabStr)}
      tabIndex={active ? 0 : -1}
      hidden={!active}
      className={className}
    >
      {active ? children : null}
    </div>
  );
}
