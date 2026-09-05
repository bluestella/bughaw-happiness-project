"use client";

import { useEffect, useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { computePnl, PNL_DEFAULTS as DEFAULTS, type PnlState } from "@/lib/pnl";
import { pesoRound } from "@/lib/format";
import { SliderField } from "@/components/ui/slider-field";
import { Chart, specToOption } from "@/components/ui/chart";
import { CHART } from "@/lib/chartTheme";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";

const FIELDS: {
  id: keyof PnlState;
  label: string;
  min: number;
  max: number;
  step: number;
  peso?: boolean;
  pct?: boolean;
  help: string;
  section: string;
}[] = [
  { id: "unitsM1", label: "Pairs sold, month 1", min: 50, max: 100000, step: 50, help: "Estimated pairs shipped to hotel partners in your first month of paid orders.", section: "Growth" },
  { id: "growthPct", label: "Monthly growth", min: 0, max: 30, step: 1, pct: true, help: "Expected month-over-month growth in pairs sold, compounding as you add hotel accounts.", section: "Growth" },
  { id: "price", label: "Hotel price", min: 80, max: 300, step: 5, peso: true, help: "What we charge the hotel per pair — should sit within the ~10% willingness-to-pay ceiling above their current supplier cost.", section: "Unit economics per pair" },
  { id: "cogs", label: "COGS", min: 10, max: 10000, step: 10, peso: true, help: "Raw coir-cassava composite material, production labor, and packaging per pair.", section: "Unit economics per pair" },
  { id: "cac", label: "CAC per new pair", min: 10, max: 200, step: 5, peso: true, help: "Sales and outreach spend behind each incremental pair of new business this month.", section: "Unit economics per pair" },
  { id: "opexMachines", label: "Machines", min: 2000, max: 80000, step: 1000, peso: true, help: "Monthly production equipment cost — depreciation, upkeep, leases.", section: "Monthly opex" },
  { id: "opexSalaries", label: "Salaries", min: 10000, max: 150000, step: 1000, peso: true, help: "Monthly payroll for production, sales, and supply chain.", section: "Monthly opex" },
  { id: "opexLogistics", label: "Logistics", min: 1000, max: 40000, step: 1000, peso: true, help: "Freight, warehousing, and delivery to hotel partners.", section: "Monthly opex" },
];

const SECTIONS = ["Growth", "Unit economics per pair", "Monthly opex"];
const KEY = "bughaw-pnl-machine";

export default function PnlPage() {
  const [s, setS] = useState<PnlState>(() => {
    if (typeof window === "undefined") return DEFAULTS;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
    } catch {}
    return DEFAULTS;
  });

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {}
  }, [s]);

  const { profits, breakevenMonth, breakevenUnits, cumulative } = useMemo(
    () => computePnl(s),
    [s]
  );

  const chartOption = useMemo(
    () =>
      specToOption(
        {
          title: "Operating profit by month",
          type: "bar",
          labels: profits.map((_, i) => `M${i + 1}`),
          series: [{ name: "Operating profit", color: CHART.green, values: profits }],
          format: "currency",
        },
        { polarity: true }
      ),
    [profits]
  );

  return (
    <div>
      <header className="mb-6 border-b border-line pb-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-coir mb-1">
          📊 Bughaw Innovations · BughawPack P2
        </p>
        <h1 className="mb-1.5 text-2xl sm:text-3xl font-semibold tracking-tight text-ink">
          Coconut slipper — 12-month P&amp;L model
        </h1>
        <p className="text-sm text-ink-soft max-w-2xl">
          Stress-test breakeven timing and year-1 cash needs for the coir-cassava slipper
          line. Figures are modeling assumptions, not confirmed pilot-scale financials.
        </p>
        <Button size="sm" className="mt-3" onClick={() => setS(DEFAULTS)}>
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Reset to defaults
        </Button>
      </header>

      <div className="grid gap-4 md:grid-cols-3 mb-6">
        {SECTIONS.map((section) => (
          <div key={section} className="rounded-xl border border-line bg-panel p-5 shadow-card">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-soft mb-4">
              {section}
            </h2>
            {FIELDS.filter((f) => f.section === section).map((f) => (
              <SliderField
                key={f.id}
                id={`pnl-${f.id}`}
                label={f.label}
                help={f.help}
                min={f.min}
                max={f.max}
                step={f.step}
                prefix={f.peso ? "₱" : undefined}
                suffix={f.pct ? "%" : undefined}
                value={s[f.id]}
                onChange={(v) => setS((prev) => ({ ...prev, [f.id]: v }))}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="mb-5 rounded-xl border border-line bg-panel p-5 shadow-card">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-soft mb-4">
          Operating profit by month
        </h2>
        <Chart
          option={chartOption}
          className="h-80"
          ariaLabel={`Operating profit by month, 12-month bar chart. ${
            breakevenMonth ? `Breakeven at month ${breakevenMonth}.` : "No breakeven within 12 months."
          } Year 1 cumulative ${pesoRound(cumulative)}.`}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Breakeven month"
          value={breakevenMonth ? `M${breakevenMonth}` : "Not within 12 mo"}
        />
        <StatCard
          label="Breakeven pairs / mo"
          value={breakevenUnits ? breakevenUnits.toLocaleString() + " pairs" : "—"}
        />
        <StatCard
          label="Year 1 cumulative"
          value={pesoRound(cumulative)}
          tone={cumulative < 0 ? "danger" : "success"}
          note="The capital gap this model implies needs bridging (if negative)."
        />
      </div>
    </div>
  );
}
