"use client";

import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { pesoRound } from "@/lib/format";
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
  { id: "material", label: "Materials", color: "#C2410C" },
  { id: "labor", label: "Labor", color: "#6D28D9" },
  { id: "freight", label: "Freight", color: "#475569" },
  { id: "breakage", label: "Breakage", color: "#BE123C" },
  { id: "duties", label: "Duties", color: "#57534E" },
  { id: "equipment", label: "Equipment", color: "#0E7490" },
];

const KEY = "bughaw-unit-econ-sim";

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
      <header className="mb-6 border-b border-line pb-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-coir mb-1">
          🎚️ Live build · Coconut slippers (BughawPack™ P2)
        </p>
        <h1 className="mb-1.5 text-2xl sm:text-3xl font-semibold tracking-tight text-ink">
          Unit Economics Simulator
        </h1>
        <p className="text-sm text-ink-soft max-w-2xl">
          Per-pair margin, hotel-account CAC, and payback — adjust the sliders to test
          scenarios. All figures are illustrative placeholders until COGS is confirmed.
        </p>
        <Button size="sm" className="mt-3" onClick={() => setS(DEFAULTS)}>
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Reset to defaults
        </Button>
      </header>

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
            <div className="space-y-3.5">
              <div className="grid grid-cols-[80px,1fr,80px] items-center gap-3">
                <span className="text-[13px] text-ink-soft text-right">Price</span>
                <div className="h-8 rounded-md overflow-hidden flex bg-[#F1F5F9]">
                  <div className="h-full w-full bg-coir flex items-center justify-center text-xs font-bold text-white">
                    {pesoRound(s.price)}
                  </div>
                </div>
                <span className="font-mono text-sm font-semibold">{pesoRound(s.price)}</span>
              </div>
              <div className="grid grid-cols-[80px,1fr,80px] items-center gap-3">
                <span className="text-[13px] text-ink-soft text-right">Costs</span>
                <div className="h-8 rounded-md overflow-hidden flex gap-[2px] bg-[#F1F5F9]">
                  {COST_SEGMENTS.map((seg) => {
                    const v = s[seg.id];
                    if (v <= 0) return null;
                    const pct = Math.max(0, (v / s.price) * 100);
                    return (
                      <div
                        key={seg.id}
                        className="h-full flex items-center justify-center text-[11px] font-bold text-white whitespace-nowrap overflow-hidden"
                        style={{ width: `${pct}%`, background: seg.color }}
                      >
                        {pct > 9 ? seg.label : ""}
                      </div>
                    );
                  })}
                </div>
                <span className="font-mono text-sm font-semibold">{pesoRound(totalCost)}</span>
              </div>
              <div className="grid grid-cols-[80px,1fr,80px] items-center gap-3">
                <span className="text-[13px] text-ink-soft text-right">Left over</span>
                <div className="h-8 rounded-md overflow-hidden flex bg-[#F1F5F9]">
                  <div
                    className="h-full flex items-center justify-center text-xs font-bold text-white"
                    style={{
                      width: `${Math.min(100, Math.max(0, (Math.abs(contribution) / s.price) * 100))}%`,
                      background: contribution >= 0 ? "#059669" : "#DC2626",
                    }}
                  >
                    {(contribution >= 0 ? "+" : "") + pesoRound(contribution)}
                  </div>
                </div>
                <span
                  className={`font-mono text-sm font-semibold ${contribution >= 0 ? "text-success" : "text-danger"}`}
                >
                  {(contribution >= 0 ? "+" : "") + pesoRound(contribution)}
                </span>
              </div>
            </div>
            <div className="flex gap-4 flex-wrap mt-4 pt-4 border-t border-line">
              {COST_SEGMENTS.map((seg) => (
                <span key={seg.id} className="flex items-center gap-1.5 text-xs text-ink-soft">
                  <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: seg.color }} />
                  {seg.label}
                </span>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Contribution"
              value={(contribution >= 0 ? "+" : "") + pesoRound(contribution)}
              tone={contribution >= 0 ? "success" : "danger"}
              note={`margin ${marginPct.toFixed(1)}% of price`}
            />
            <StatCard
              label="LTV (per hotel)"
              value={pesoRound(ltv)}
              note="margin/pair × pairs/mo × lifetime"
            />
            <StatCard
              label="LTV : CAC"
              value={`${ratio.toFixed(1)}×`}
              tone={ratio >= 3 ? "success" : "amber"}
              note="a healthy account is ≥3×"
            />
            <StatCard
              label="CAC payback"
              value={isFinite(payback) ? payback.toFixed(1) + " mo" : "—"}
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
