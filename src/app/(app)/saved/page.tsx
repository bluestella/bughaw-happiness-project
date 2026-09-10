"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { ALL_CALCULATORS, calculatorPath } from "@/lib/calculators/registry";
import { formatValue } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SkeletonCard } from "@/components/ui/skeleton";

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
  const [pendingDelete, setPendingDelete] = useState<SavedRow | null>(null);

  useEffect(() => {
    document.title = "Saved calculations · Bughaw Suite";
  }, []);

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

  async function remove(row: SavedRow) {
    const { error } = await supabase.from("saved_calculations").delete().eq("id", row.id);
    if (error) {
      toast.error(`Delete failed: ${error.message}`);
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    toast.success("Snapshot deleted.");
  }

  return (
    <div>
      <header className="mb-6 border-b border-line pb-5">
        <h1 className="mb-1.5 text-2xl sm:text-3xl font-semibold tracking-tight text-ink">
          Saved calculations
        </h1>
        <p className="text-sm text-ink-soft">
          Team-wide snapshots saved from any calculator. Newest first.
        </p>
      </header>

      {!loaded ? (
        <div className="space-y-3">
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-panel px-6 py-10 text-center">
          <p className="text-sm text-ink-soft">
            Nothing saved yet — open a calculator and press “Save to team”.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const config = ALL_CALCULATORS.find((c) => c.id === r.calculator_id);
            return (
              <div
                key={r.id}
                className="rounded-xl border border-line bg-panel p-5 shadow-card"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[15px] font-semibold text-ink">
                      {config ? config.name : r.calculator_id}
                      {r.label && (
                        <span className="font-normal text-ink-soft"> — {r.label}</span>
                      )}
                    </p>
                    <p className="mt-0.5 text-[11px] text-ink-soft">
                      {r.created_by_email ?? "unknown"} ·{" "}
                      {new Date(r.created_at).toLocaleString("en-PH")}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {config && (
                      <Button asChild size="sm">
                        <Link href={calculatorPath(config)}>Open calculator</Link>
                      </Button>
                    )}
                    <Button intent="danger" size="sm" onClick={() => setPendingDelete(r)}>
                      Delete
                    </Button>
                  </div>
                </div>
                {config && (
                  <div className="mt-3 flex flex-wrap gap-4 border-t border-dashed border-line pt-3">
                    {config.outputs.map((o) => (
                      <div key={o.id}>
                        <p className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">
                          {o.label}
                        </p>
                        <p className="font-mono text-[13px] font-semibold tabular-nums">
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

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete snapshot?"
        description={
          pendingDelete
            ? `This removes “${pendingDelete.label || pendingDelete.calculator_id}” for the whole team. This can’t be undone.`
            : undefined
        }
        onConfirm={async () => {
          if (pendingDelete) await remove(pendingDelete);
        }}
      />
    </div>
  );
}
