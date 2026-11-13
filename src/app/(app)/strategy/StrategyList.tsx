"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import {
  KIND_INFO,
  WORKSHEET_KINDS,
  emptyData,
  validateWorksheet,
  worksheetHeadline,
  type WorksheetKind,
  type WorksheetRow,
} from "@/lib/strategy";
import { Field } from "../sales/SalesShell";

export function StrategyList({ worksheets }: { worksheets: WorksheetRow[] }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [kind, setKind] = useState<WorksheetKind>("porter");
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const data = emptyData(kind);
    const v = validateWorksheet({ kind, title, data });
    if (v.title) return setError(v.title);
    setError("");
    setBusy(true);
    const { data: row, error: err } = await supabase
      .from("strategy_worksheets")
      .insert({ kind, title: title.trim(), data: data as never })
      .select("id")
      .single();
    setBusy(false);
    if (err || !row) return toast.error(err?.message ?? "Could not create the worksheet.");
    router.push(`/strategy/${row.id}`);
  }

  return (
    <div className="space-y-6">
      <form onSubmit={create} noValidate aria-label="New worksheet" className="rounded-xl border border-line bg-white p-4 shadow-card">
        <h2 className="mb-3 text-sm font-semibold text-ink">New worksheet</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Framework" hint={KIND_INFO[kind].question}>
            <Select value={kind} onChange={(e) => setKind(e.target.value as WorksheetKind)} aria-label="Framework">
              {WORKSHEET_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_INFO[k].label} ({KIND_INFO[k].origin})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Title" className="sm:col-span-2">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Hotel slippers market, 2027" />
            {error && <span role="alert" className="mt-1 block text-[11px] text-danger">{error}</span>}
          </Field>
        </div>
        <Button className="mt-3" intent="primary" size="sm" type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create worksheet"}
        </Button>
      </form>

      <section aria-label="Saved worksheets">
        <h2 className="mb-2 text-sm font-semibold text-ink">Saved worksheets</h2>
        {worksheets.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line p-6 text-center text-[13px] text-ink-soft">
            Nothing saved yet. Pick a framework above to start.
          </p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line bg-white shadow-card">
            {worksheets.map((w) => (
              <li key={w.id}>
                <Link href={`/strategy/${w.id}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 hover:bg-coir-bg/40">
                  <span>
                    <span className="block text-[13px] font-semibold text-ink">{w.title}</span>
                    <span className="block text-[12px] text-ink-soft">{KIND_INFO[w.kind].label} · {worksheetHeadline(w.kind, w.data)}</span>
                  </span>
                  <span className="font-mono text-[11px] text-ink-soft">
                    {new Date(w.updated_at).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
