"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { CATEGORIES, type CategoryId } from "@/lib/calculators/types";
import { ALL_CALCULATORS, calculatorPath } from "@/lib/calculators/registry";
import { getIcon } from "@/lib/icons";
import { Input } from "@/components/ui/input";
import { TabBar, TabPanel } from "@/components/ui/tab-bar";
import { CatalogRow } from "@/components/ui/card";

const ALL_TAB = "all" as const;
type CategoryFilter = CategoryId | typeof ALL_TAB;

export function CalculatorCatalog() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>(ALL_TAB);

  const tabs = useMemo(
    () => [{ id: ALL_TAB, label: "All" }, ...CATEGORIES.map((c) => ({ id: c.id, label: c.name }))],
    []
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ALL_CALCULATORS.filter((c) => {
      if (category !== ALL_TAB && c.category !== category) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q);
    });
  }, [query, category]);

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <TabBar idBase="calc-catalog" tabs={tabs} value={category} onChange={setCategory} />
        <div className="relative sm:w-64">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-soft"
            strokeWidth={1.75}
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter calculators…"
            aria-label="Search calculators by name or description"
            className="pl-8"
          />
        </div>
      </div>

      <TabPanel idBase="calc-catalog" value={category as any} current={category as any}>
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line bg-panel px-6 py-10 text-center">
            <p className="text-sm text-ink-soft">No calculators match “{query}”.</p>
          </div>
        ) : (
          <div className="divide-y divide-line rounded-xl border border-line bg-panel">
            {filtered.map((c) => {
              const cat = CATEGORIES.find((cd) => cd.id === c.category);
              return (
                <CatalogRow
                  key={c.id}
                  href={calculatorPath(c)}
                  icon={getIcon(c.icon)}
                  name={c.name}
                  description={c.description}
                  tag={cat?.name}
                />
              );
            })}
          </div>
        )}
      </TabPanel>
    </div>
  );
}
