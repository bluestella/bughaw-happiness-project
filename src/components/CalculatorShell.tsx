"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
import type { CalculatorConfig, Inputs } from "@/lib/calculators/types";
import { formatValue, pesoRound } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Chart, specToOption } from "@/components/ui/chart";
import { StatCard } from "@/components/ui/stat-card";
import { VerdictBanner } from "@/components/ui/verdict-banner";
import {
  Dialog,
  DialogBackdrop,
  DialogPopup,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";

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

/** Reads persisted inputs synchronously so the first paint shows real values. */
function initialInputs(config: CalculatorConfig, storageKey: string): Inputs {
  const defaults = defaultsFor(config);
  if (typeof window === "undefined") return defaults;
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch {}
  return defaults;
}

export function CalculatorShell({ config }: { config: CalculatorConfig }) {
  const storageKey = `bughaw-calc-${config.id}`;
  const [inputs, setInputs] = useState<Inputs>(() => initialInputs(config, storageKey));
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveLabel, setSaveLabel] = useState("");
  const [savingToTeam, setSavingToTeam] = useState(false);

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

  async function saveToTeam(label: string) {
    setSavingToTeam(true);
    const supabase = createClient();
    const { error } = await supabase.from("saved_calculations").insert({
      calculator_id: config.id,
      label,
      inputs,
      outputs,
    });
    setSavingToTeam(false);
    if (error) {
      toast.error(`Save failed: ${error.message}`);
      return;
    }
    toast.success("Saved to team workspace.");
    setSaveOpen(false);
  }

  return (
    <div>
      <header className="mb-6 border-b border-line pb-5">
        <p className="mb-1 font-mono text-[11px] uppercase tracking-[0.12em] text-coir">
          {config.icon} {config.category.replace("-", " ")}
        </p>
        <h1 className="mb-1.5 text-2xl sm:text-3xl font-semibold tracking-tight text-ink">
          {config.name}
        </h1>
        <p className="max-w-2xl text-sm text-ink-soft">{config.description}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[380px,1fr] items-start">
        <div className="space-y-4">
          {config.inputGroups.map((group) => (
            <section
              key={group.id}
              className="rounded-xl border border-line bg-panel p-5 shadow-card"
            >
              <h2 className="mb-4 text-sm font-semibold text-ink">{group.title}</h2>
              {group.fields.map((f) => (
                <div key={f.id} className="mb-3.5 last:mb-0">
                  <label className="mb-1 block text-xs font-medium text-ink-soft" htmlFor={f.id}>
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
                      onWheel={(e) => e.currentTarget.blur()}
                      className={`w-full rounded-lg border border-line bg-white py-2 font-mono text-sm transition-colors focus:border-coir focus:outline-none focus:ring-2 focus:ring-coir/20 ${
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
                    <p className="mt-1 text-[11px] text-ink-soft">{f.helpText}</p>
                  )}
                </div>
              ))}
            </section>
          ))}

          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setInputs(defaultsFor(config))}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Reset defaults
            </Button>
            <Button size="sm" onClick={exportCsv}>
              Export CSV
            </Button>
            <Button size="sm" onClick={exportJson}>
              Export JSON
            </Button>
            <Button size="sm" intent="primary" onClick={() => setSaveOpen(true)}>
              Save to team
            </Button>
          </div>
        </div>

        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            {config.outputs.map((o) => (
              <StatCard
                key={o.id}
                label={o.label}
                emphasis={o.emphasis}
                note={o.note}
                value={
                  o.format === "currency"
                    ? pesoRound(outputs[o.id])
                    : formatValue(o.format, outputs[o.id])
                }
              />
            ))}
          </div>

          {verdict && <VerdictBanner ok={verdict.ok}>{verdict.text}</VerdictBanner>}

          {chart && (
            <div className="rounded-xl border border-line bg-panel p-5 shadow-card">
              <h2 className="mb-4 text-sm font-semibold text-ink">{chart.title}</h2>
              <Chart
                option={specToOption(chart)}
                className="h-64 sm:h-72"
                ariaLabel={`${chart.title} — ${chart.type} chart of ${chart.series
                  .map((s) => s.name)
                  .join(", ")}`}
              />
            </div>
          )}
        </div>
      </div>

      <Dialog.Root open={saveOpen} onOpenChange={setSaveOpen}>
        <Dialog.Portal>
          <DialogBackdrop />
          <DialogPopup>
            <DialogTitle>Save to team</DialogTitle>
            <DialogDescription>
              Optionally add a label to help your team find this later.
            </DialogDescription>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!savingToTeam) saveToTeam(saveLabel);
              }}
            >
              <div className="mt-3">
                <Input
                  placeholder="Label (optional)"
                  value={saveLabel}
                  onChange={(e) => setSaveLabel(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <DialogClose>Cancel</DialogClose>
                <Button intent="primary" size="sm" type="submit" disabled={savingToTeam}>
                  {savingToTeam ? "Saving…" : "Save"}
                </Button>
              </div>
            </form>
          </DialogPopup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
