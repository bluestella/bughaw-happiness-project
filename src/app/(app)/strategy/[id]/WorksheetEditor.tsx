"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import {
  HORIZONS,
  MAX_ROWS,
  PORTER_FORCES,
  RICE_IMPACT,
  SCORECARD_PERSPECTIVES,
  cleanData,
  horizonMix,
  nineBoxCells,
  objectiveProgress,
  porterSummary,
  riceRanking,
  scorecardProgress,
  seanEllisSummary,
  validateWorksheet,
  type HorizonsData,
  type NineBoxData,
  type PorterData,
  type RiceData,
  type ScorecardData,
  type SeanEllisData,
  type WorksheetData,
  type WorksheetRow,
} from "@/lib/strategy";
import { Field } from "../../sales/SalesShell";

const card = "rounded-xl border border-line bg-white p-4 shadow-card";

/** A number box that shows blank for 0 and never produces NaN. */
function Num({ label, value, onChange, min = 0, max, step = "any", hint }: {
  label: string; value: number; onChange: (n: number) => void; min?: number; max?: number; step?: string; hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <Input
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={value === 0 ? "" : value}
        placeholder="0"
        onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
      />
    </Field>
  );
}

function RemoveButton({ onClick, what }: { onClick: () => void; what: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={`Remove ${what}`} className="self-end rounded-lg border border-line p-2 text-ink-soft hover:border-danger hover:text-danger">
      <Trash2 className="h-4 w-4" aria-hidden />
    </button>
  );
}

function AddRow({ onClick, children, disabled }: { onClick: () => void; children: React.ReactNode; disabled: boolean }) {
  return (
    <Button type="button" intent="secondary" size="sm" onClick={onClick} disabled={disabled}>
      <Plus className="mr-1 h-4 w-4" aria-hidden /> {children}
    </Button>
  );
}

function Result({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="rounded-xl border border-coir bg-coir-bg/40 p-4">
      <h2 className="mb-2 text-sm font-semibold text-coir-dark">{title}</h2>
      {children}
    </section>
  );
}

export function WorksheetEditor({ worksheet, isAdmin }: { worksheet: WorksheetRow; isAdmin: boolean }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const kind = worksheet.kind;
  const [title, setTitle] = useState(worksheet.title);
  const [data, setData] = useState<WorksheetData>(() => cleanData(kind, worksheet.data));
  const [loadedAt, setLoadedAt] = useState(worksheet.updated_at);
  const [saved, setSaved] = useState(() => JSON.stringify({ t: worksheet.title, d: cleanData(kind, worksheet.data) }));
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dirty = JSON.stringify({ t: title.trim(), d: cleanData(kind, data) }) !== saved && title.trim() !== "";

  async function save() {
    const cleaned = cleanData(kind, data);
    const v = validateWorksheet({ kind, title, data: cleaned });
    if (v.title) return toast.error(v.title);
    setBusy(true);
    // Refuse to overwrite a newer save by someone else: the update only matches the row we loaded.
    const { data: rows, error } = await supabase
      .from("strategy_worksheets")
      .update({ title: title.trim(), data: cleaned as never })
      .eq("id", worksheet.id)
      .eq("updated_at", loadedAt)
      .select("updated_at");
    setBusy(false);
    if (error) return toast.error(error.message);
    if (!rows || rows.length === 0) return toast.error("Someone saved a newer version. Reload the page to see it before you save again.");
    setLoadedAt(rows[0].updated_at as string);
    setSaved(JSON.stringify({ t: title.trim(), d: cleaned }));
    toast.success("Saved.");
  }

  async function remove() {
    const { error } = await supabase.from("strategy_worksheets").delete().eq("id", worksheet.id);
    if (error) {
      toast.error(error.message);
      throw error;
    }
    toast.success("Worksheet deleted.");
    router.push("/strategy");
  }

  return (
    <div className="space-y-5">
      <div className={`${card} flex flex-wrap items-end gap-3`}>
        <Field label="Title" className="min-w-[16rem] flex-1">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Worksheet title" />
        </Field>
        <Button intent="primary" size="sm" onClick={save} disabled={busy || !dirty}>
          {busy ? "Saving…" : dirty ? "Save" : "Saved"}
        </Button>
        {isAdmin && (
          <Button intent="danger" size="sm" onClick={() => setConfirmDelete(true)}>
            Delete
          </Button>
        )}
      </div>

      {kind === "porter" && <PorterForm data={data as PorterData} set={setData} />}
      {kind === "three_horizons" && <HorizonsForm data={data as HorizonsData} set={setData} />}
      {kind === "balanced_scorecard" && <ScorecardForm data={data as ScorecardData} set={setData} />}
      {kind === "rice" && <RiceForm data={data as RiceData} set={setData} />}
      {kind === "nine_box" && <NineBoxForm data={data as NineBoxData} set={setData} />}
      {kind === "sean_ellis" && <SeanEllisForm data={data as SeanEllisData} set={setData} />}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this worksheet?"
        description="It is removed for everyone and cannot be recovered."
        onConfirm={remove}
      />
    </div>
  );
}

type FormProps<T> = { data: T; set: React.Dispatch<React.SetStateAction<WorksheetData>> };

// ---------- Five Forces ----------
function PorterForm({ data, set }: FormProps<PorterData>) {
  const s = porterSummary(data);
  const edit = (key: (typeof PORTER_FORCES)[number]["key"], patch: Partial<{ rating: number; notes: string }>) =>
    set({ forces: { ...data.forces, [key]: { ...data.forces[key], ...patch } } });
  return (
    <>
      <div className="space-y-3">
        {PORTER_FORCES.map((f) => (
          <div key={f.key} className={`${card} grid gap-3 sm:grid-cols-[1fr_9rem_2fr]`}>
            <div>
              <p className="text-[13px] font-semibold text-ink">{f.label}</p>
              <p className="text-[11px] text-ink-soft">{f.hint}</p>
            </div>
            <Field label="Pressure (1-5)">
              <Select value={String(data.forces[f.key].rating)} onChange={(e) => edit(f.key, { rating: Number(e.target.value) })} aria-label={`${f.label} pressure`}>
                <option value="0">Not rated</option>
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
              </Select>
            </Field>
            <Field label="Why">
              <Textarea rows={2} value={data.forces[f.key].notes} onChange={(e) => edit(f.key, { notes: e.target.value })} aria-label={`${f.label} notes`} />
            </Field>
          </div>
        ))}
      </div>
      <Result title="Result">
        <p className="text-[15px] font-semibold text-ink">{s.verdict}</p>
        {s.average > 0 && <p className="text-[13px] text-ink-soft">Average pressure {s.average} of 5.{s.strongest && ` Strongest force: ${s.strongest.label} (${s.strongest.rating}).`}</p>}
      </Result>
    </>
  );
}

// ---------- Three Horizons ----------
function HorizonsForm({ data, set }: FormProps<HorizonsData>) {
  const mix = horizonMix(data);
  const edit = (i: number, patch: Partial<HorizonsData["items"][number]>) =>
    set({ items: data.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
  return (
    <>
      <div className="space-y-3">
        {data.items.map((it, i) => (
          <div key={i} className={`${card} grid gap-3 sm:grid-cols-[2fr_2fr_7rem_auto]`}>
            <Field label="Initiative"><Input value={it.name} onChange={(e) => edit(i, { name: e.target.value })} aria-label={`Initiative ${i + 1}`} /></Field>
            <Field label="Horizon">
              <Select value={String(it.horizon)} onChange={(e) => edit(i, { horizon: Number(e.target.value) as 1 | 2 | 3 })} aria-label={`Horizon for initiative ${i + 1}`}>
                {HORIZONS.map((h) => <option key={h.n} value={h.n}>{h.label}</option>)}
              </Select>
            </Field>
            <Num label="Effort %" value={it.share} max={100} onChange={(n) => edit(i, { share: n })} />
            <RemoveButton onClick={() => set({ items: data.items.filter((_, j) => j !== i) })} what={`initiative ${i + 1}`} />
          </div>
        ))}
        <AddRow disabled={data.items.length >= MAX_ROWS} onClick={() => set({ items: [...data.items, { name: "", horizon: 1, share: 0, notes: "" }] })}>Add initiative</AddRow>
      </div>
      <Result title="Where the effort goes">
        <table className="w-full text-[13px]">
          <thead><tr className="text-left font-mono text-[10px] uppercase text-ink-soft"><th className="py-1">Horizon</th><th>Share</th><th>Common target</th><th>Gap</th></tr></thead>
          <tbody>
            {mix.map((m) => (
              <tr key={m.n}><td className="py-1">{m.label}</td><td>{m.pct}%</td><td>{m.target}%</td><td>{m.gap > 0 ? "+" : ""}{m.gap} pts</td></tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[11px] text-ink-soft">70/20/10 is a common starting point, not a rule. A pre-revenue company may rightly be heavier on Horizons 2 and 3.</p>
      </Result>
    </>
  );
}

// ---------- Balanced Scorecard ----------
function ScorecardForm({ data, set }: FormProps<ScorecardData>) {
  const result = scorecardProgress(data);
  const edit = (key: keyof ScorecardData["perspectives"], list: ScorecardData["perspectives"][typeof key]) =>
    set({ perspectives: { ...data.perspectives, [key]: list } });
  return (
    <>
      {SCORECARD_PERSPECTIVES.map((p) => {
        const rows = data.perspectives[p.key];
        const upd = (i: number, patch: Partial<ScorecardData["perspectives"][typeof p.key][number]>) =>
          edit(p.key, rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
        return (
          <section key={p.key} aria-label={p.label} className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-ink">{p.label}</h2>
              <p className="text-[12px] text-ink-soft">{p.question}</p>
            </div>
            {rows.map((r, i) => (
              <div key={i} className={`${card} grid gap-3 sm:grid-cols-[2fr_2fr_6rem_6rem_5rem_auto]`}>
                <Field label="Objective"><Input value={r.objective} onChange={(e) => upd(i, { objective: e.target.value })} aria-label={`${p.label} objective ${i + 1}`} /></Field>
                <Field label="Measure"><Input value={r.measure} onChange={(e) => upd(i, { measure: e.target.value })} aria-label={`${p.label} measure ${i + 1}`} /></Field>
                <Num label="Target" value={r.target} onChange={(n) => upd(i, { target: n })} />
                <Num label="Actual" value={r.actual} onChange={(n) => upd(i, { actual: n })} />
                <div className="self-end pb-2 font-mono text-[12px] text-ink">{objectiveProgress(r)}%</div>
                <RemoveButton onClick={() => edit(p.key, rows.filter((_, j) => j !== i))} what={`${p.label} objective ${i + 1}`} />
              </div>
            ))}
            <AddRow disabled={rows.length >= MAX_ROWS} onClick={() => edit(p.key, [...rows, { objective: "", measure: "", target: 0, actual: 0 }])}>Add objective to {p.label}</AddRow>
          </section>
        );
      })}
      <Result title="Progress to target">
        <ul className="text-[13px]">
          {result.perspectives.map((p) => (
            <li key={p.key} className="flex justify-between py-0.5"><span>{p.label}</span><span className="font-mono">{p.count === 0 ? "no objectives" : `${p.average}%`}</span></li>
          ))}
        </ul>
        <p className="mt-2 text-[13px] font-semibold text-ink">Overall {result.overall}%</p>
      </Result>
    </>
  );
}

// ---------- RICE ----------
function RiceForm({ data, set }: FormProps<RiceData>) {
  const ranking = riceRanking(data);
  const edit = (i: number, patch: Partial<RiceData["items"][number]>) =>
    set({ items: data.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
  return (
    <>
      <div className="space-y-3">
        {data.items.map((it, i) => (
          <div key={i} className={`${card} grid gap-3 sm:grid-cols-[2fr_6rem_8rem_6rem_6rem_auto]`}>
            <Field label="Idea"><Input value={it.name} onChange={(e) => edit(i, { name: e.target.value })} aria-label={`Idea ${i + 1}`} /></Field>
            <Num label="Reach" hint="people per quarter" value={it.reach} onChange={(n) => edit(i, { reach: n })} />
            <Field label="Impact">
              <Select value={String(it.impact)} onChange={(e) => edit(i, { impact: Number(e.target.value) })} aria-label={`Impact of idea ${i + 1}`}>
                {RICE_IMPACT.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </Field>
            <Num label="Confidence %" max={100} value={it.confidence} onChange={(n) => edit(i, { confidence: n })} />
            <Num label="Effort" hint="person-months" value={it.effort} onChange={(n) => edit(i, { effort: n })} />
            <RemoveButton onClick={() => set({ items: data.items.filter((_, j) => j !== i) })} what={`idea ${i + 1}`} />
          </div>
        ))}
        <AddRow disabled={data.items.length >= MAX_ROWS} onClick={() => set({ items: [...data.items, { name: "", reach: 0, impact: 1, confidence: 50, effort: 0, notes: "" }] })}>Add idea</AddRow>
      </div>
      <Result title="Do these first">
        {ranking.length === 0 ? <p className="text-[13px] text-ink-soft">Add and name an idea to see the ranking.</p> : (
          <ol className="text-[13px]">
            {ranking.map((r) => (
              <li key={r.index} className="flex justify-between py-0.5"><span>{r.rank}. {r.item.name}</span><span className="font-mono">{r.score}</span></li>
            ))}
          </ol>
        )}
        <p className="mt-2 text-[11px] text-ink-soft">Score = reach × impact × confidence ÷ effort. An idea with no effort entered scores 0.</p>
      </Result>
    </>
  );
}

// ---------- Nine-box ----------
function NineBoxForm({ data, set }: FormProps<NineBoxData>) {
  const cells = nineBoxCells(data);
  const edit = (i: number, patch: Partial<NineBoxData["items"][number]>) =>
    set({ items: data.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
  const level = (n: number) => (n === 1 ? "Low" : n === 2 ? "Medium" : "High");
  return (
    <>
      <div className="space-y-3">
        {data.items.map((it, i) => (
          <div key={i} className={`${card} grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto]`}>
            <Field label="Name"><Input value={it.name} onChange={(e) => edit(i, { name: e.target.value })} aria-label={`Name ${i + 1}`} /></Field>
            <Field label="Performance">
              <Select value={String(it.performance)} onChange={(e) => edit(i, { performance: Number(e.target.value) as 1 | 2 | 3 })} aria-label={`Performance of ${it.name || `item ${i + 1}`}`}>
                {[1, 2, 3].map((n) => <option key={n} value={n}>{level(n)}</option>)}
              </Select>
            </Field>
            <Field label="Potential">
              <Select value={String(it.potential)} onChange={(e) => edit(i, { potential: Number(e.target.value) as 1 | 2 | 3 })} aria-label={`Potential of ${it.name || `item ${i + 1}`}`}>
                {[1, 2, 3].map((n) => <option key={n} value={n}>{level(n)}</option>)}
              </Select>
            </Field>
            <RemoveButton onClick={() => set({ items: data.items.filter((_, j) => j !== i) })} what={`item ${i + 1}`} />
          </div>
        ))}
        <AddRow disabled={data.items.length >= MAX_ROWS} onClick={() => set({ items: [...data.items, { name: "", performance: 2, potential: 2, notes: "" }] })}>Add person, product or account</AddRow>
      </div>
      <Result title="The grid (potential up, performance across)">
        <div className="grid grid-cols-3 gap-2">
          {cells.map((c) => (
            <div key={`${c.performance}-${c.potential}`} className="min-h-[5rem] rounded-lg border border-line bg-white p-2">
              <p className="font-mono text-[10px] uppercase text-ink-soft">{c.label}</p>
              <p className="text-[12px] text-ink">{c.names.join(", ")}</p>
            </div>
          ))}
        </div>
      </Result>
    </>
  );
}

// ---------- Sean Ellis ----------
function SeanEllisForm({ data, set }: FormProps<SeanEllisData>) {
  const s = seanEllisSummary(data);
  const int = (k: "very" | "somewhat" | "not" | "na") => (n: number) => set({ ...data, [k]: Math.max(0, Math.round(n)) });
  return (
    <>
      <div className={card}>
        <p className="mb-3 text-[13px] text-ink">Ask customers: <em>How would you feel if you could no longer use this product?</em> Enter how many gave each answer.</p>
        <div className="grid gap-3 sm:grid-cols-4">
          <Num label="Very disappointed" step="1" value={data.very} onChange={int("very")} />
          <Num label="Somewhat disappointed" step="1" value={data.somewhat} onChange={int("somewhat")} />
          <Num label="Not disappointed" step="1" value={data.not} onChange={int("not")} />
          <Num label="No longer use it" step="1" value={data.na} onChange={int("na")} />
        </div>
        <Field label="Notes" className="mt-3"><Textarea rows={2} value={data.notes} onChange={(e) => set({ ...data, notes: e.target.value })} aria-label="Survey notes" /></Field>
      </div>
      <Result title="Result">
        <p className="text-[15px] font-semibold text-ink">{s.verdict}</p>
        {s.total > 0 && <p className="text-[13px] text-ink-soft">{s.veryPct}% very disappointed, from {s.total} responses. 40% or more is the usual sign of product-market fit.</p>}
      </Result>
    </>
  );
}
