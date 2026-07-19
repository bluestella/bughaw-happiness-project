"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CalculatorConfig, Inputs } from "@/lib/calculators/types";
import { formatValue, pesoRound } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

function defaultsFor(config: CalculatorConfig): Inputs {
  const out: Inputs = {};
  config.inputGroups.forEach((g) =>
    g.fields.forEach((f) => {
      out[f.id] = f.defaultValue;
    })
  );
  return out;
}

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function CalculatorShell({ config }: { config: CalculatorConfig }) {
  const storageKey = `bughaw-calc-${config.id}`;
  const [inputs, setInputs] = useState<Inputs>(() => defaultsFor(config));
  const [status, setStatus] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setInputs({ ...defaultsFor(config), ...JSON.parse(raw) });
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(inputs));
    } catch {}
  }, [inputs, storageKey]);

  const outputs = useMemo(() => config.compute(inputs), [config, inputs]);
  const chart = config.chart?.(inputs, outputs);
  const verdict = config.verdict?.(inputs, outputs);

  function setField(id: string, value: string) {
    const n = value === "" ? 0 : parseFloat(value);
    setInputs((prev) => ({ ...prev, [id]: isNaN(n) ? 0 : n }));
  }

  function flash(msg: string) {
    setStatus(msg);
    setTimeout(() => setStatus(""), 2500);
  }

  function exportCsv() {
    const rows: string[][] = [["Field", "Value"]];
    config.inputGroups.forEach((g) =>
      g.fields.forEach((f) => rows.push([f.label, String(inputs[f.id] ?? "")]))
    );
    config.outputs.forEach((o) =>
      rows.push([o.label, formatValue(o.format, outputs[o.id])])
    );
    const csv = rows
      .map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(","))
      .join("\n");
    download(`bughaw-${config.id}.csv`, csv, "text/csv");
  }

  function exportJson() {
    download(
      `bughaw-${config.id}.json`,
      JSON.stringify({ calculator: config.id, inputs, outputs, exportedAt: new Date().toISOString() }, null, 2),
      "application/json"
    );
  }

  async function saveToTeam() {
    const label = window.prompt("Label for this saved calculation (optional):") ?? "";
    const supabase = createClient();
    const { error } = await supabase.from("saved_calculations").insert({
      calculator_id: config.id,
      label,
      inputs,
      outputs,
    });
    flash(error ? `Save failed: ${error.message}` : "Saved to team workspace.");
  }

  const chartData =
    chart?.labels.map((label, idx) => {
      const point: Record<string, number | string> = { label };
      chart.series.forEach((s) => (point[s.name] = Math.round(s.values[idx])));
      return point;
    }) ?? [];

  const tickFormat = (v: number) =>
    chart?.format === "currency"
      ? "₱" + (Math.abs(v) >= 1000 ? (v / 1000).toFixed(0) + "k" : String(v))
      : String(v);

  return (
    <div>
      <header className="mb-6 border-b border-line pb-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-coir-dark mb-1">
          {config.icon} {config.category.replace("-", " ")}
        </p>
        <h1 className="font-display text-3xl font-semibold text-ink mb-1.5">{config.name}</h1>
        <p className="text-sm text-ink-soft max-w-2xl">{config.description}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[380px,1fr] items-start">
        <div className="space-y-4">
          {config.inputGroups.map((group) => (
            <section key={group.id} className="bg-panel border border-line rounded-xl p-5">
              <h2 className="font-display text-sm font-semibold text-ink mb-4">
                {group.title}
              </h2>
              {group.fields.map((f) => (
                <div key={f.id} className="mb-3.5 last:mb-0">
                  <label className="block text-xs text-ink-soft mb-1" htmlFor={f.id}>
                    {f.label}
                  </label>
                  <div className="relative">
                    {f.type === "currency" && (
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-soft">
                        ₱
                      </span>
                    )}
                    <input
                      id={f.id}
                      type="number"
                      value={inputs[f.id] ?? 0}
                      min={f.min}
                      max={f.max}
                      step={f.step ?? "any"}
                      onChange={(e) => setField(f.id, e.target.value)}
                      className={`w-full border border-line rounded-md py-2 text-sm font-mono focus:outline-none focus:border-coir focus:ring-2 focus:ring-coir/20 ${
                        f.type === "currency" ? "pl-7 pr-3" : "px-3"
                      } ${f.type === "percentage" ? "pr-8" : ""}`}
                    />
                    {f.type === "percentage" && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-soft">
                        %
                      </span>
                    )}
                  </div>
                  {f.helpText && (
                    <p className="text-[11px] text-ink-soft mt-1">{f.helpText}</p>
                  )}
                </div>
              ))}
            </section>
          ))}

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setInputs(defaultsFor(config))}
              className="text-xs border border-line rounded-md px-3 py-2 text-ink hover:border-ink-soft"
            >
              ↺ Reset defaults
            </button>
            <button
              onClick={exportCsv}
              className="text-xs border border-line rounded-md px-3 py-2 text-ink hover:border-ink-soft"
            >
              Export CSV
            </button>
            <button
              onClick={exportJson}
              className="text-xs border border-line rounded-md px-3 py-2 text-ink hover:border-ink-soft"
            >
              Export JSON
            </button>
            <button
              onClick={saveToTeam}
              className="text-xs bg-coir hover:bg-coir-dark text-white font-semibold rounded-md px-3 py-2"
            >
              Save to team
            </button>
          </div>
          <p className="font-mono text-[11px] text-ink-soft min-h-4">{status}</p>
        </div>

        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            {config.outputs.map((o) => (
              <div
                key={o.id}
                className={`rounded-xl border p-5 ${
                  o.emphasis
                    ? "bg-coir-bg border-[#D6E4CE]"
                    : "bg-panel border-line"
                }`}
              >
                <p className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-soft mb-2">
                  {o.label}
                </p>
                <p
                  className={`font-display font-semibold ${
                    o.emphasis ? "text-[26px] text-coir-dark" : "text-[22px] text-ink"
                  }`}
                >
                  {o.format === "currency"
                    ? pesoRound(outputs[o.id])
                    : formatValue(o.format, outputs[o.id])}
                </p>
                {o.note && <p className="text-[11px] text-ink-soft mt-1.5">{o.note}</p>}
              </div>
            ))}
          </div>

          {verdict && (
            <div
              className={`rounded-xl border px-5 py-3.5 text-sm font-medium ${
                verdict.ok
                  ? "bg-coir-bg border-[#D6E4CE] text-coir-dark"
                  : "bg-[#FBEBE6] border-[#E8C4B8] text-danger"
              }`}
            >
              {verdict.ok ? "✓ " : "✕ "}
              {verdict.text}
            </div>
          )}

          {chart && (
            <div className="bg-panel border border-line rounded-xl p-5">
              <h2 className="font-display text-sm font-semibold text-ink mb-4">
                {chart.title}
              </h2>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  {chart.type === "bar" ? (
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#DED6C4" />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6B6355" }} />
                      <YAxis tickFormatter={tickFormat} tick={{ fontSize: 11, fill: "#6B6355" }} width={56} />
                      <Tooltip formatter={(v) => (chart.format === "currency" ? pesoRound(Number(v)) : v)} />
                      {chart.series.length > 1 && <Legend />}
                      {chart.series.map((s) => (
                        <Bar key={s.name} dataKey={s.name} fill={s.color} radius={[4, 4, 0, 0]} />
                      ))}
                    </BarChart>
                  ) : (
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#DED6C4" />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6B6355" }} />
                      <YAxis tickFormatter={tickFormat} tick={{ fontSize: 11, fill: "#6B6355" }} width={56} />
                      <Tooltip formatter={(v) => (chart.format === "currency" ? pesoRound(Number(v)) : v)} />
                      {chart.series.length > 1 && <Legend />}
                      {chart.series.map((s) => (
                        <Line
                          key={s.name}
                          type="monotone"
                          dataKey={s.name}
                          stroke={s.color}
                          strokeWidth={2}
                          dot={false}
                        />
                      ))}
                    </LineChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
