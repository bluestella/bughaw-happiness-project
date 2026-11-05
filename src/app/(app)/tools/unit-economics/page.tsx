"use client";

import { useEffect, useState } from "react";
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { pesoCompact, pesoRound, ratioCompact } from "@/lib/format";
import { CalculatorHeader } from "@/components/CalculatorHeader";
import { SliderField } from "@/components/ui/slider-field";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";

interface SimState {
  price: number;
  material: number;
  labor: number;
  freight: number;
  breakage: number;
  duties: number;
  equipment: number;
  cac: number;
  vol: number;
  life: number;
}

const DEFAULTS: SimState = {
  price: 180, material: 52, labor: 22, freight: 8, breakage: 4,
  duties: 0, equipment: 15, cac: 8000, vol: 60, life: 12,
};

const SLIDERS: {
  id: keyof SimState;
  label: string;
  min: number;
  max: number;
  step: number;
  peso?: boolean;
  suffix?: string;
  section: "pair" | "account";
}[] = [
  { id: "price", label: "Price per pair (to hotel)", min: 60, max: 400, step: 5, peso: true, section: "pair" },
  { id: "material", label: "Materials (coir–TPS + packaging)", min: 5, max: 180, step: 1, peso: true, section: "pair" },
  { id: "labor", label: "Labor & molding", min: 0, max: 100, step: 1, peso: true, section: "pair" },
  { id: "freight", label: "Freight", min: 0, max: 60, step: 1, peso: true, section: "pair" },
  { id: "breakage", label: "Breakage / spoilage", min: 0, max: 60, step: 1, peso: true, section: "pair" },
  { id: "duties", label: "Duties (domestic supply chain = 0)", min: 0, max: 60, step: 1, peso: true, section: "pair" },
  { id: "equipment", label: "Equipment (amortized per pair)", min: 0, max: 100, step: 1, peso: true, section: "pair" },
  { id: "cac", label: "CAC — cost to win one hotel", min: 500, max: 60000, step: 500, peso: true, section: "account" },
  { id: "vol", label: "Pairs ordered / month", min: 10, max: 1000000, step: 10, section: "account" },
  { id: "life", label: "Contract / reorder lifetime", min: 1, max: 36, step: 1, suffix: " mo", section: "account" },
];

const COST_SEGMENTS: { id: keyof SimState; label: string; color: string }[] = [
  { id: "material", label: "Materials", color: "#6E5A42" },
  { id: "labor", label: "Labor", color: "#17517D" },
  { id: "freight", label: "Freight", color: "#8A6215" },
  { id: "breakage", label: "Breakage", color: "#A8412A" },
  { id: "duties", label: "Duties", color: "#6B6355" },
  { id: "equipment", label: "Equipment", color: "#2C6B38" },
];

const KEY = "bughaw-unit-econ-sim";

const signedPeso = (n: number) => (n >= 0 ? "+" : "") + pesoRound(n);

/** "<0.1 mo" instead of a misleading "0.0 mo" when payback is near-instant. */
function formatPayback(months: number): string {
  if (!Number.isFinite(months)) return "—";
  if (months < 0.1) return "<0.1 mo";
  return months.toFixed(1) + " mo";
}

export default function UnitEconomicsPage() {
  const [s, setS] = useState<SimState>(() => {
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

  const totalCost = s.material + s.labor + s.freight + s.breakage + s.duties + s.equipment;
  const contribution = s.price - totalCost;
  const marginPct = s.price > 0 ? (contribution / s.price) * 100 : 0;
  const monthlyContribution = contribution * s.vol;
  const ltv = monthlyContribution * s.life;
  const ratio = s.cac > 0 ? ltv / s.cac : 0;
  const payback = monthlyContribution > 0 ? s.cac / monthlyContribution : Infinity;
  const gatePass = marginPct >= 30;

  const scale = Math.max(s.price, totalCost, 1);
  const pctOfScale = (v: number) => Math.min(100, Math.max(0, (v / scale) * 100));

  const slider = (def: (typeof SLIDERS)[number]) => (
    <SliderField
      key={def.id}
      id={`ue-${def.id}`}
      label={def.label}
      min={def.min}
      max={def.max}
      step={def.step}
      prefix={def.peso ? "₱" : undefined}
      suffix={def.suffix?.trim() || undefined}
      value={s[def.id]}
      onChange={(v) => setS((prev) => ({ ...prev, [def.id]: v }))}
    />
  );

  return (
    <div>
      <CalculatorHeader
        icon={SlidersHorizontal}
        eyebrow="Live build · Coconut slippers (BughawPack™ P2)"
        title="Unit Economics Simulator"
        description="Per-pair margin, hotel-account CAC, and payback — adjust the sliders to test scenarios. All figures are illustrative placeholders until COGS is confirmed."
        action={
          <Button size="sm" className="mt-3" onClick={() => setS(DEFAULTS)}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Reset to defaults
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[400px,1fr] items-start">
        <div className="rounded-xl border border-line bg-panel p-5 shadow-card">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-soft mb-4">
            The unit: one pair
          </h2>
          {SLIDERS.filter((d) => d.section === "pair").map(slider)}
          <h2 className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-soft mb-4 mt-6 pt-5 border-t border-line">
            The hotel account
          </h2>
          {SLIDERS.filter((d) => d.section === "account").map(slider)}
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-line bg-panel p-5 shadow-card">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-soft mb-4">
              Where the ₱ goes — one pair
            </h2>
            {/* One shared axis (max of price and cost) so the three bars are comparable
                and costs above price visibly overrun instead of being clipped. Values live
                in the right column + legend; no text inside bars, so nothing truncates. */}
            <div className="grid grid-cols-[auto,minmax(0,1fr),auto] items-center gap-x-3 gap-y-3">
              <span className="text-[13px] text-ink-soft">Price</span>
              <div className="h-6 rounded-md bg-paper">
                <div
                  className="h-full rounded-md bg-coir"
                  style={{ width: `${pctOfScale(s.price)}%` }}
                />
              </div>
              <span className="text-right font-mono text-sm font-semibold tabular-nums">
                {pesoRound(s.price)}
              </span>

              <span className="text-[13px] text-ink-soft">Costs</span>
              <div className="h-6 rounded-md bg-paper">
                <div
                  className="flex h-full gap-px overflow-hidden rounded-md"
                  style={{ width: `${pctOfScale(totalCost)}%` }}
                >
                  {COST_SEGMENTS.map((seg) => {
                    const v = s[seg.id];
                    if (v <= 0) return null;
                    return (
                      <div
                        key={seg.id}
                        title={`${seg.label}: ${pesoRound(v)}`}
                        className="h-full"
                        style={{ flexGrow: v, flexBasis: 0, background: seg.color }}
                      />
                    );
                  })}
                </div>
              </div>
              <span className="text-right font-mono text-sm font-semibold tabular-nums">
                {pesoRound(totalCost)}
              </span>

              <span className="text-[13px] text-ink-soft">Left over</span>
              <div className="h-6 rounded-md bg-paper">
                <div
                  className={`h-full rounded-md ${contribution >= 0 ? "bg-success" : "bg-danger"}`}
                  style={{ width: `${pctOfScale(Math.abs(contribution))}%` }}
                />
              </div>
              <span
                className={`text-right font-mono text-sm font-semibold tabular-nums ${contribution >= 0 ? "text-success" : "text-danger"}`}
              >
                {signedPeso(contribution)}
              </span>
            </div>

            <ul className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2 border-t border-line pt-4 sm:grid-cols-3">
              {COST_SEGMENTS.map((seg) => {
                const v = s[seg.id];
                return (
                  <li
                    key={seg.id}
                    className={`flex min-w-0 items-center gap-2 text-xs ${v > 0 ? "" : "opacity-50"}`}
                  >
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ background: seg.color }}
                    />
                    <span className="truncate text-ink-soft">{seg.label}</span>
                    <span className="ml-auto font-mono tabular-nums text-ink">{pesoRound(v)}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="grid grid-cols-2 gap-4 2xl:grid-cols-4">
            <StatCard
              label="Contribution"
              value={<span title={signedPeso(contribution)}>{signedPeso(contribution)}</span>}
              tone={contribution >= 0 ? "success" : "danger"}
              note={`margin ${marginPct.toFixed(1)}% of price`}
            />
            <StatCard
              label="LTV (per hotel)"
              value={<span title={pesoRound(ltv)}>{pesoCompact(ltv)}</span>}
              note="margin/pair × pairs/mo × lifetime"
            />
            <StatCard
              label="LTV : CAC"
              value={<span title={`${ratio.toFixed(2)}×`}>{ratioCompact(ratio)}</span>}
              tone={ratio >= 3 ? "success" : "amber"}
              note="a healthy account is ≥3×"
            />
            <StatCard
              label="CAC payback"
              value={formatPayback(payback)}
              tone={isFinite(payback) && payback <= s.life ? "success" : "amber"}
              note="months to earn the CAC back"
            />
          </div>

          <div
            className={`rounded-xl border px-5 py-3.5 text-sm flex justify-between items-center flex-wrap gap-2 ${
              gatePass
                ? "bg-success-bg border-success-border text-success"
                : "bg-amber-bg border-amber-border text-amber"
            }`}
          >
            <span className="text-ink-soft">Reference — Bughaw Go/No-Go gate: gross margin ≥30% at scale</span>
            <span className="font-semibold">
              {marginPct.toFixed(1)}% — {gatePass ? "clears gate" : "below gate"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
