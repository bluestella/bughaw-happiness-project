"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { pesoRound } from "@/lib/format";
import { computePnl, PNL_DEFAULTS as DEFAULTS, type PnlState } from "@/lib/pnl";

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
  const [s, setS] = useState<PnlState>(DEFAULTS);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setS({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {}
  }, [s]);

  const { profits, breakevenMonth, breakevenUnits, cumulative } = useMemo(
    () => computePnl(s),
    [s]
  );

  const chartData = profits.map((p, i) => ({ label: `M${i + 1}`, profit: Math.round(p) }));

  return (
    <div>
      <header className="mb-6 border-b border-line pb-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-coir-dark mb-1">
          📊 Bughaw Innovations · BughawPack P2
        </p>
        <h1 className="font-display text-3xl font-semibold text-ink mb-1.5">
          Coconut slipper — 12-month P&amp;L model
        </h1>
        <p className="text-sm text-ink-soft max-w-2xl">
          Stress-test breakeven timing and year-1 cash needs for the coir-cassava slipper
          line. Figures are modeling assumptions, not confirmed pilot-scale financials.
        </p>
        <button
          className="mt-3 text-xs border border-line rounded-md px-3 py-2 hover:border-ink-soft"
          onClick={() => setS(DEFAULTS)}
        >
          ↺ Reset to defaults
        </button>
      </header>

      <div className="grid gap-4 md:grid-cols-3 mb-6">
        {SECTIONS.map((section) => (
          <div key={section} className="bg-panel border border-line rounded-xl p-5">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-soft mb-4">
              {section}
            </h2>
            {FIELDS.filter((f) => f.section === section).map((f) => (
              <div key={f.id} className="mb-4 last:mb-0">
                <div className="flex justify-between items-baseline mb-2">
                  <span className="text-[13px] text-ink-soft" title={f.help}>
                    {f.label}
                    <span className="ml-1 text-[10px] text-ink-soft/70 cursor-help border border-line rounded-full px-1" title={f.help}>
                      i
                    </span>
                  </span>
                  <span className="font-mono text-[13px] font-semibold">
                    {f.peso ? pesoRound(s[f.id]) : f.pct ? s[f.id] + "%" : s[f.id].toLocaleString()}
                  </span>
                </div>
                <input
                  type="range"
                  min={f.min}
                  max={f.max}
                  step={f.step}
                  value={s[f.id]}
                  onChange={(e) => setS((prev) => ({ ...prev, [f.id]: +e.target.value }))}
                />
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="bg-panel border border-line rounded-xl p-5 mb-5">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-soft mb-4">
          Operating profit by month
        </h2>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6B6355" }} />
              <YAxis
                tickFormatter={(v: number) =>
                  (v < 0 ? "-" : "") + "₱" + Math.abs(v / 1000).toFixed(0) + "k"
                }
                tick={{ fontSize: 11, fill: "#6B6355" }}
                width={62}
              />
              <Tooltip formatter={(v) => pesoRound(Number(v))} />
              <Bar dataKey="profit" radius={[4, 4, 0, 0]} maxBarSize={40}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={d.profit < 0 ? "#B4703F" : "#5C7A4F"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="bg-panel border border-line rounded-xl p-5">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-soft mb-2">
            Breakeven month
          </p>
          <p className="font-display text-2xl font-semibold text-ink">
            {breakevenMonth ? `M${breakevenMonth}` : "Not within 12 mo"}
          </p>
        </div>
        <div className="bg-panel border border-line rounded-xl p-5">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-soft mb-2">
            Breakeven pairs / mo
          </p>
          <p className="font-display text-2xl font-semibold text-ink">
            {breakevenUnits ? breakevenUnits.toLocaleString() + " pairs" : "—"}
          </p>
        </div>
        <div className="bg-panel border border-line rounded-xl p-5">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-soft mb-2">
            Year 1 cumulative
          </p>
          <p className={`font-display text-2xl font-semibold ${cumulative < 0 ? "text-danger" : "text-coir-dark"}`}>
            {pesoRound(cumulative)}
          </p>
          <p className="text-[11px] text-ink-soft mt-1">
            The capital gap this model implies needs bridging (if negative).
          </p>
        </div>
      </div>
    </div>
  );
}
