"use client";

import { useMemo, useState } from "react";
import { Chart, specToOption } from "@/components/ui/chart";
import { StatCard } from "@/components/ui/stat-card";
import { Select } from "@/components/ui/select";
import { CHART } from "@/lib/chartTheme";
import { formatValue } from "@/lib/format";
import {
  CARD_SOURCES,
  CLICK_TARGETS,
  DEVICES,
  SOURCE_LABEL,
  TARGET_LABEL,
  manilaToday,
  summarizeCardEvents,
  type BusinessCard,
  type RollupRow,
} from "@/lib/cards";
import { StatusPill } from "./CardsAdmin";

const PERIODS = [7, 30, 90] as const;
const DEVICE_LABEL = { mobile: "Mobile", tablet: "Tablet", desktop: "Desktop", unknown: "Unknown" } as const;

function Breakdown({ title, rows }: { title: string; rows: Array<{ label: string; value: number }> }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="rounded-xl border border-line bg-panel p-5 shadow-card">
      <h3 className="mb-3 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-soft">{title}</h3>
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.label}>
            <div className="mb-1 flex justify-between text-[12.5px]">
              <span className="text-ink">{r.label}</span>
              <span className="font-mono tabular-nums text-ink">{r.value.toLocaleString()}</span>
            </div>
            <div className="h-1.5 rounded-full bg-line/60" aria-hidden>
              <div className="h-1.5 rounded-full bg-coir" style={{ width: `${(r.value / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CardAnalytics({ cards, rollup }: { cards: BusinessCard[]; rollup: RollupRow[] }) {
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const [cardId, setCardId] = useState("");

  const summary = useMemo(
    () => summarizeCardEvents(rollup, { today: manilaToday(), days, cardId: cardId || undefined }),
    [rollup, days, cardId]
  );
  const { totals } = summary;

  const chartOption = useMemo(
    () => ({
      // specToOption colors bars per data point; set the palette so the legend matches.
      color: [CHART.blue, CHART.clay],
      ...specToOption({
        title: "Views and contact saves per day",
        type: "bar",
        labels: summary.days.map((d) => d.slice(5)),
        series: [
          { name: "Views", color: CHART.blue, values: summary.daily.views },
          { name: "Contact saves", color: CHART.clay, values: summary.daily.saves },
        ],
        format: "number",
      }),
    }),
    [summary]
  );

  const visibleCards = cardId ? cards.filter((c) => c.id === cardId) : cards;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[140px]">
          <label htmlFor="analytics-period" className="mb-1 block text-[11px] font-semibold text-ink-soft">
            Period
          </label>
          <Select
            id="analytics-period"
            value={days}
            onChange={(e) => setDays(Number(e.target.value) as (typeof PERIODS)[number])}
          >
            {PERIODS.map((p) => (
              <option key={p} value={p}>
                Last {p} days
              </option>
            ))}
          </Select>
        </div>
        <div className="min-w-[220px]">
          <label htmlFor="analytics-card" className="mb-1 block text-[11px] font-semibold text-ink-soft">
            Card
          </label>
          <Select id="analytics-card" value={cardId} onChange={(e) => setCardId(e.target.value)}>
            <option value="">All cards</option>
            {cards.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Views" value={totals.views.toLocaleString()} emphasis />
        <StatCard label="Contact saves" value={totals.saves.toLocaleString()} />
        <StatCard
          label="Save rate"
          value={totals.views > 0 ? formatValue("percentage", totals.saveRate * 100) : "—"}
          note="Saves ÷ views"
        />
        <StatCard label="Link clicks" value={totals.clicks.toLocaleString()} />
        <StatCard label="Wallet adds" value={totals.wallet.toLocaleString()} />
      </div>

      <div className="rounded-xl border border-line bg-panel p-5 shadow-card">
        <h2 className="mb-4 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-soft">
          Views and contact saves per day
        </h2>
        <Chart
          option={chartOption}
          className="h-72"
          ariaLabel={`Daily views and contact saves over the last ${days} days: ${totals.views} views, ${totals.saves} saves.`}
        />
        <p className="mt-3 text-[11.5px] text-ink-soft">
          Primary data · Bughaw card event log, days in Asia/Manila time. Crawlers and link-preview bots are
          excluded; no visitor is identified, so repeat visits count again.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Breakdown
          title="Views by source"
          rows={CARD_SOURCES.map((s) => ({ label: SOURCE_LABEL[s], value: summary.bySource[s] }))}
        />
        <Breakdown
          title="Views by device"
          rows={DEVICES.map((d) => ({ label: DEVICE_LABEL[d], value: summary.byDevice[d] }))}
        />
        <Breakdown
          title="Clicks by link"
          rows={CLICK_TARGETS.map((t) => ({ label: TARGET_LABEL[t], value: summary.byTarget[t] }))}
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-line bg-white shadow-card">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-line text-[11px] uppercase tracking-[0.06em] text-ink-soft">
              <th className="px-4 py-2.5 font-semibold">Card</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
              <th className="px-4 py-2.5 text-right font-semibold">Views</th>
              <th className="px-4 py-2.5 text-right font-semibold">Saves</th>
              <th className="px-4 py-2.5 text-right font-semibold">Save rate</th>
              <th className="px-4 py-2.5 text-right font-semibold">Clicks</th>
              <th className="px-4 py-2.5 text-right font-semibold">Wallet</th>
            </tr>
          </thead>
          <tbody>
            {visibleCards.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-ink-soft">
                  No cards yet.
                </td>
              </tr>
            )}
            {visibleCards.map((c) => {
              const s = summary.perCard[c.id];
              return (
                <tr key={c.id} className="border-b border-line last:border-b-0">
                  <td className="px-4 py-2.5">
                    <span className="block font-semibold text-ink">{c.full_name}</span>
                    <span className="block text-[12px] text-ink-soft">{c.job_title || "—"}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusPill status={c.status} />
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">{s?.views ?? 0}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">{s?.saves ?? 0}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                    {s && s.views > 0 ? formatValue("percentage", s.saveRate * 100) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">{s?.clicks ?? 0}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">{s?.wallet ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
