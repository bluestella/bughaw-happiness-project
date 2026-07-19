"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ALL_CALCULATORS, calculatorPath } from "@/lib/calculators/registry";
import { formatValue } from "@/lib/format";

interface SavedRow {
  id: string;
  calculator_id: string;
  label: string;
  inputs: Record<string, number>;
  outputs: Record<string, number>;
  created_by_email: string | null;
  created_at: string;
}

export default function SavedPage() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<SavedRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("saved_calculations")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      setRows((data as SavedRow[]) ?? []);
      setLoaded(true);
    })();
  }, [supabase]);

  async function remove(id: string) {
    await supabase.from("saved_calculations").delete().eq("id", id);
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <div>
      <header className="mb-6 border-b border-line pb-5">
        <h1 className="font-display text-3xl font-semibold text-ink mb-1.5">
          Saved calculations
        </h1>
        <p className="text-sm text-ink-soft">
          Team-wide snapshots saved from any calculator. Newest first.
        </p>
      </header>

      {!loaded ? (
        <p className="text-sm text-ink-soft">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-ink-soft">
          Nothing saved yet — open a calculator and press “Save to team”.
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const config = ALL_CALCULATORS.find((c) => c.id === r.calculator_id);
            return (
              <div key={r.id} className="bg-panel border border-line rounded-xl p-5">
                <div className="flex justify-between items-start gap-3 flex-wrap">
                  <div>
                    <p className="font-display text-[15px] font-semibold text-ink">
                      {config ? `${config.icon} ${config.name}` : r.calculator_id}
                      {r.label && <span className="text-ink-soft font-normal"> — {r.label}</span>}
                    </p>
                    <p className="text-[11px] text-ink-soft mt-0.5">
                      {r.created_by_email ?? "unknown"} ·{" "}
                      {new Date(r.created_at).toLocaleString("en-PH")}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {config && (
                      <Link
                        href={calculatorPath(config)}
                        className="text-xs border border-line rounded-md px-3 py-1.5 hover:border-ink-soft"
                      >
                        Open calculator
                      </Link>
                    )}
                    <button
                      onClick={() => remove(r.id)}
                      className="text-xs border border-[#E8C4B8] text-danger rounded-md px-3 py-1.5 hover:bg-[#FBEBE6]"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                {config && (
                  <div className="flex gap-4 flex-wrap mt-3 pt-3 border-t border-dashed border-line">
                    {config.outputs.map((o) => (
                      <div key={o.id}>
                        <p className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">
                          {o.label}
                        </p>
                        <p className="font-mono text-[13px] font-semibold">
                          {formatValue(o.format, r.outputs[o.id])}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
