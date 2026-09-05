"use client";

import { cn } from "@/lib/cn";

export type TabItem<T extends string = string> = { id: T; label: string };

/** Segmented tab row used by the pipeline/funding tools. */
export function TabBar<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: readonly TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-line bg-paper p-1",
        className
      )}
    >
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
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
