"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAppState } from "@/lib/useAppState";
import { pesoRound } from "@/lib/format";

const STAGES = ["Warm Contact", "Meeting Secured", "Sample Delivered", "PO Signed", "Repeat Order"] as const;
const SIM_STAGES = [...STAGES, "Dropped Out"];
const CHECKPOINT = "2026-07-24";

interface Account {
  id: string;
  name: string;
  property: string;
  segment: "A" | "B";
  stage: string;
  contact: string;
  notes: string;
  reason: string;
  referred_by: string;
  generated_referral: boolean;
}

interface SimState {
  projections: Record<string, string>;
  hypothetical: { id: string; name: string; segment: "A" | "B"; stage: string }[];
}

interface EconState {
  spend: string;
  revenue: string;
  margin: string;
  years: string;
  mode: "today" | "projected";
}

const EMPTY_FORM: Omit<Account, "id"> = {
  name: "", property: "", segment: "A", stage: "Warm Contact",
  contact: "", notes: "", reason: "", referred_by: "", generated_referral: false,
};

const inputCls =
  "w-full border border-line rounded-md px-2.5 py-2 text-[13px] focus:outline-none focus:border-coir focus:ring-2 focus:ring-coir/20 bg-white";

function SegTag({ segment }: { segment: "A" | "B" }) {
  return (
    <span
      className={`font-mono text-[10px] px-2 py-0.5 rounded-full border uppercase tracking-wide ${
        segment === "A" ? "text-clay border-clay/50" : "text-coir-dark border-coir/50"
      }`}
    >
      Segment {segment}
    </span>
  );
}

export default function PipelinePage() {
  const supabase = useMemo(() => createClient(), []);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  const [tab, setTab] = useState<"sim" | "econ" | "track">("sim");
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<Account | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<Omit<Account, "id">>(EMPTY_FORM);
  const [gyOpen, setGyOpen] = useState(false);
  const [hypName, setHypName] = useState("");
  const [hypSegment, setHypSegment] = useState<"A" | "B">("A");
  const [hypStage, setHypStage] = useState<string>(STAGES[0]);
  const [revealStep, setRevealStep] = useState(0);

  const sim = useAppState<SimState>("pipeline-sim", { projections: {}, hypothetical: [] });
  const econ = useAppState<EconState>("pipeline-econ", {
    spend: "", revenue: "", margin: "", years: "", mode: "today",
  });

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("pipeline_accounts")
        .select("*")
        .order("created_at", { ascending: true });
      if (!error && data) setAccounts(data as Account[]);
      if (error) setStatus("Could not load accounts: " + error.message);
      setAccountsLoaded(true);
    })();
  }, [supabase]);

  function flash(msg: string) {
    setStatus(msg);
    setTimeout(() => setStatus(""), 2500);
  }

  const active = accounts.filter((a) => a.stage !== "Disqualified");
  const projectionFor = (a: Account) => sim.value.projections[a.id] || a.stage;
  const poIdx = STAGES.indexOf("PO Signed");
  const stageIdx = (s: string) => STAGES.indexOf(s as (typeof STAGES)[number]);

  const payersFor = (mode: "today" | "projected") => {
    if (mode === "today") return active.filter((a) => stageIdx(a.stage) >= poIdx).length;
    return (
      active.filter((a) => stageIdx(projectionFor(a)) >= poIdx).length +
      sim.value.hypothetical.filter((h) => stageIdx(h.stage) >= poIdx).length
    );
  };
  const accountsInPlay = (mode: "today" | "projected") =>
    mode === "today" ? active.length : active.length + sim.value.hypothetical.length;

  const daysLeft = Math.ceil(
    (new Date(CHECKPOINT + "T00:00:00").getTime() - Date.now()) / 86400000
  );

  // ---------- account CRUD ----------
  function openModal(account: Account | null) {
    setEditing(account);
    setForm(
      account
        ? {
            name: account.name,
            property: account.property,
            segment: account.segment,
            stage: account.stage,
            contact: account.contact,
            notes: account.notes,
            reason: account.reason,
            referred_by: account.referred_by,
            generated_referral: account.generated_referral,
          }
        : EMPTY_FORM
    );
    setModalOpen(true);
  }

  async function saveAccount() {
    if (!form.name.trim()) return flash("Give the account a name first.");
    if (editing) {
      const { error } = await supabase
        .from("pipeline_accounts")
        .update({ ...form, updated_at: new Date().toISOString() })
        .eq("id", editing.id);
      if (error) return flash("Save failed: " + error.message);
      setAccounts((prev) => prev.map((a) => (a.id === editing.id ? { ...a, ...form } : a)));
    } else {
      const { data, error } = await supabase
        .from("pipeline_accounts")
        .insert(form)
        .select()
        .single();
      if (error) return flash("Save failed: " + error.message);
      setAccounts((prev) => [...prev, data as Account]);
    }
    setModalOpen(false);
    flash("Saved.");
  }

  async function deleteAccount() {
    if (!editing) return;
    const { error } = await supabase.from("pipeline_accounts").delete().eq("id", editing.id);
    if (error) return flash("Delete failed: " + error.message);
    setAccounts((prev) => prev.filter((a) => a.id !== editing.id));
    sim.update((prev) => {
      const projections = { ...prev.projections };
      delete projections[editing.id];
      return { ...prev, projections };
    });
    setModalOpen(false);
    flash("Deleted.");
  }

  // ---------- econ ----------
  const spend = parseFloat(econ.value.spend) || 0;
  const revenue = parseFloat(econ.value.revenue) || 0;
  const margin = parseFloat(econ.value.margin) || 0;
  const years = parseFloat(econ.value.years) || 0;
  const play = accountsInPlay(econ.value.mode);
  const payers = payersFor(econ.value.mode);
  const cac = payers > 0 ? spend / payers : null;
  const ltv = revenue * (margin / 100) * years;
  const ratio = cac && cac > 0 ? ltv / cac : null;

  // ---------- simulator verdict ----------
  const projPayers = payersFor("projected");
  const sampleIdx = STAGES.indexOf("Sample Delivered");
  const signalCount =
    active.filter((a) => stageIdx(projectionFor(a)) >= sampleIdx).length +
    sim.value.hypothetical.filter((h) => stageIdx(h.stage) >= sampleIdx).length;

  const todayCounts: Record<string, number> = {};
  const projCounts: Record<string, number> = { "Dropped Out": 0 };
  STAGES.forEach((s) => {
    todayCounts[s] = active.filter((a) => a.stage === s).length;
    projCounts[s] = 0;
  });
  active.forEach((a) => {
    const p = projectionFor(a);
    projCounts[p] = (projCounts[p] || 0) + 1;
  });
  sim.value.hypothetical.forEach((h) => {
    projCounts[h.stage] = (projCounts[h.stage] || 0) + 1;
  });

  const graveyard = accounts.filter((a) => a.stage === "Disqualified");

  const tabBtn = (id: typeof tab, label: string) => (
    <button
      onClick={() => setTab(id)}
      className={`font-semibold text-[13px] px-4 py-2 rounded-lg border ${
        tab === id
          ? "bg-coir-bg border-coir text-coir-dark"
          : "bg-panel border-line text-ink-soft hover:text-ink"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div>
      <header className="mb-5 border-b border-line pb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-coir-dark mb-1">
            🛤️ Internal — Bughaw Innovations
          </p>
          <h1 className="font-display text-3xl font-semibold text-ink mb-1.5">
            Pipeline Simulator
          </h1>
          <p className="text-sm text-ink-soft max-w-xl">
            Model what has to happen by the checkpoint, then see what it actually costs to
            get there. Shared live with the whole team.
          </p>
        </div>
        <div className="bg-panel border border-line rounded-xl px-4 py-3 min-w-52">
          <p className="text-[10px] uppercase tracking-[0.1em] text-ink-soft">
            Joint decision checkpoint
          </p>
          <p className="font-display font-semibold text-base">July 24, 2026</p>
          <p className="font-mono text-xs text-clay mt-0.5">
            {daysLeft > 0
              ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} away`
              : daysLeft === 0
                ? "today"
                : `${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? "" : "s"} past`}
          </p>
        </div>
      </header>

      <div className="flex gap-2 mb-5 flex-wrap">
        {tabBtn("sim", "Simulator")}
        {tabBtn("econ", "Unit Economics")}
        {tabBtn("track", "Real Pipeline (source data)")}
      </div>

      {!accountsLoaded ? (
        <p className="text-sm text-ink-soft">Loading team pipeline…</p>
      ) : (
        <>
          {tab === "sim" && (
            <div>
              <div
                className={`rounded-xl border px-5 py-4 mb-4 ${
                  projPayers > 0
                    ? "bg-coir-bg border-[#D6E4CE]"
                    : "bg-[#FBEBE6] border-[#E8C4B8]"
                }`}
              >
                <p className={`font-display font-semibold text-[15px] ${projPayers > 0 ? "text-coir-dark" : "text-danger"}`}>
                  {projPayers > 0
                    ? `Primary bar met: ${projPayers} account${projPayers === 1 ? "" : "s"} projected to PO Signed or beyond`
                    : "Primary bar not met under this scenario — 0 accounts projected to PO Signed"}
                </p>
                <p className="text-xs text-ink-soft mt-1">
                  {signalCount} account{signalCount === 1 ? "" : "s"} projected at Sample
                  Delivered or beyond as supporting signal.
                  {projPayers === 0 &&
                    " Per the beta plan, earlier positive signals still count this round — but a paid PO is the primary bar."}
                </p>
              </div>

              <div className="flex gap-2.5 flex-wrap mb-5">
                {[...STAGES, "Dropped Out"].map((s) => (
                  <div key={s} className="bg-panel border border-line rounded-lg px-3.5 py-2.5 min-w-28">
                    <p className="text-[10px] uppercase tracking-wide text-ink-soft">{s}</p>
                    <p className="font-display font-bold mt-0.5">
                      <span className="text-[15px] text-ink-soft">{todayCounts[s] || 0}</span>
                      <span className="text-clay text-[13px] mx-1.5">→</span>
                      <span className="text-[19px]">{projCounts[s] || 0}</span>
                    </p>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 mb-4 flex-wrap">
                <button
                  className="text-xs border border-line rounded-md px-3 py-2 hover:border-ink-soft"
                  onClick={() => sim.update({ projections: {}, hypothetical: [] })}
                >
                  Reset to current state
                </button>
                <button
                  className="text-xs border border-line rounded-md px-3 py-2 hover:border-ink-soft"
                  onClick={() =>
                    sim.update((prev) => {
                      const projections = { ...prev.projections };
                      active.forEach((a) => {
                        const idx = stageIdx(projections[a.id] || a.stage);
                        if (idx > -1 && idx < STAGES.length - 1)
                          projections[a.id] = STAGES[idx + 1];
                      });
                      return {
                        projections,
                        hypothetical: prev.hypothetical.map((h) => {
                          const idx = stageIdx(h.stage);
                          return idx > -1 && idx < STAGES.length - 1
                            ? { ...h, stage: STAGES[idx + 1] }
                            : h;
                        }),
                      };
                    })
                  }
                >
                  Everyone advances one stage
                </button>
              </div>

              <div className="overflow-x-auto border border-line rounded-xl bg-panel">
                <table className="w-full min-w-[680px]">
                  <thead>
                    <tr className="bg-[#FBF9F3]">
                      {["Account", "Segment", "Current stage", "Projected by Jul 24", ""].map((h) => (
                        <th key={h} className="text-left font-mono text-[10.5px] uppercase tracking-wide text-ink-soft px-3.5 py-3 border-b border-line">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {active.map((a) => (
                      <tr key={a.id} className="border-b border-line last:border-0">
                        <td className="px-3.5 py-2.5 text-[13px] font-semibold">{a.name}</td>
                        <td className="px-3.5 py-2.5"><SegTag segment={a.segment} /></td>
                        <td className="px-3.5 py-2.5 text-[13px]">{a.stage}</td>
                        <td className="px-3.5 py-2.5">
                          <select
                            className={inputCls}
                            value={projectionFor(a)}
                            onChange={(e) =>
                              sim.update((prev) => ({
                                ...prev,
                                projections: { ...prev.projections, [a.id]: e.target.value },
                              }))
                            }
                          >
                            {SIM_STAGES.map((s) => <option key={s}>{s}</option>)}
                          </select>
                        </td>
                        <td />
                      </tr>
                    ))}
                    {sim.value.hypothetical.map((h) => (
                      <tr key={h.id} className="border-b border-line last:border-0">
                        <td className="px-3.5 py-2.5 text-[13px] font-semibold">
                          {h.name}{" "}
                          <span className="font-mono text-[10px] px-2 py-0.5 rounded-full border border-amber/60 text-amber uppercase">
                            hypothetical
                          </span>
                        </td>
                        <td className="px-3.5 py-2.5"><SegTag segment={h.segment} /></td>
                        <td className="px-3.5 py-2.5 text-[13px] text-ink-soft">—</td>
                        <td className="px-3.5 py-2.5">
                          <select
                            className={inputCls}
                            value={h.stage}
                            onChange={(e) =>
                              sim.update((prev) => ({
                                ...prev,
                                hypothetical: prev.hypothetical.map((x) =>
                                  x.id === h.id ? { ...x, stage: e.target.value } : x
                                ),
                              }))
                            }
                          >
                            {SIM_STAGES.map((s) => <option key={s}>{s}</option>)}
                          </select>
                        </td>
                        <td className="px-3.5 py-2.5">
                          <button
                            className="text-danger text-sm px-1.5"
                            title="Remove"
                            onClick={() =>
                              sim.update((prev) => ({
                                ...prev,
                                hypothetical: prev.hypothetical.filter((x) => x.id !== h.id),
                              }))
                            }
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex gap-2 mt-4 flex-wrap items-center">
                <input
                  className={`${inputCls} max-w-56`}
                  placeholder="Hypothetical lead name (e.g. new referral)"
                  value={hypName}
                  onChange={(e) => setHypName(e.target.value)}
                />
                <select className={`${inputCls} w-auto`} value={hypSegment} onChange={(e) => setHypSegment(e.target.value as "A" | "B")}>
                  <option value="A">Segment A</option>
                  <option value="B">Segment B</option>
                </select>
                <select className={`${inputCls} w-auto`} value={hypStage} onChange={(e) => setHypStage(e.target.value)}>
                  {SIM_STAGES.map((s) => <option key={s}>{s}</option>)}
                </select>
                <button
                  className="bg-coir hover:bg-coir-dark text-white font-semibold text-xs rounded-md px-3.5 py-2.5"
                  onClick={() => {
                    if (!hypName.trim()) return flash("Give the hypothetical lead a name first.");
                    sim.update((prev) => ({
                      ...prev,
                      hypothetical: [
                        ...prev.hypothetical,
                        { id: "hyp-" + Date.now(), name: hypName.trim(), segment: hypSegment, stage: hypStage },
                      ],
                    }));
                    setHypName("");
                  }}
                >
                  + Add hypothetical
                </button>
              </div>
              <p className="text-xs text-ink-soft mt-2">
                Hypothetical leads exist only in the simulator — they won&apos;t appear in the
                real pipeline tab until you actually add them there.
              </p>
            </div>
          )}

          {tab === "econ" && (
            <div>
              <div className="flex justify-between items-center flex-wrap gap-3 mb-5">
                <div className="flex gap-2">
                  <button
                    className={`text-[13px] font-semibold px-4 py-2 rounded-lg border ${econ.value.mode === "today" ? "bg-coir-bg border-coir text-coir-dark" : "bg-panel border-line text-ink-soft"}`}
                    onClick={() => { econ.update((p) => ({ ...p, mode: "today" })); setRevealStep(0); }}
                  >
                    Today (real)
                  </button>
                  <button
                    className={`text-[13px] font-semibold px-4 py-2 rounded-lg border ${econ.value.mode === "projected" ? "bg-coir-bg border-coir text-coir-dark" : "bg-panel border-line text-ink-soft"}`}
                    onClick={() => { econ.update((p) => ({ ...p, mode: "projected" })); setRevealStep(0); }}
                  >
                    Projected (Jul 24 scenario)
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    className="bg-coir hover:bg-coir-dark disabled:opacity-50 text-white font-semibold text-xs rounded-md px-3.5 py-2.5"
                    disabled={revealStep >= 4}
                    onClick={() => setRevealStep((r) => Math.min(4, r + 1))}
                  >
                    {revealStep >= 4
                      ? "All revealed"
                      : "Reveal ▸ " + ["Accounts in play", "Payers", "Derived CAC", "LTV vs CAC"][revealStep]}
                  </button>
                  <button
                    className="text-xs border border-line rounded-md px-3.5 py-2.5 hover:border-ink-soft"
                    onClick={() => setRevealStep(4)}
                  >
                    Show all
                  </button>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[300px,1fr] items-start">
                <div className="bg-panel border border-line rounded-xl p-5">
                  <h3 className="font-display text-sm font-semibold mb-4">Your inputs</h3>
                  {[
                    { id: "spend", label: "Sales & BD spend this period (₱)", ph: "e.g. advisor fee + travel + samples" },
                    { id: "revenue", label: "Avg annual revenue per paying account (₱)", ph: "your best current estimate" },
                    { id: "margin", label: "Gross margin % (unconfirmed COGS)", ph: "e.g. 82–91, model projection" },
                    { id: "years", label: "Expected relationship length (years)", ph: "e.g. 2" },
                  ].map((f) => (
                    <div key={f.id} className="mb-3.5">
                      <label className="block text-[11px] uppercase tracking-wide text-ink-soft mb-1.5">
                        {f.label}
                      </label>
                      <input
                        type="number"
                        className={`${inputCls} font-mono`}
                        placeholder={f.ph}
                        value={econ.value[f.id as keyof EconState] as string}
                        onChange={(e) => econ.update((p) => ({ ...p, [f.id]: e.target.value }))}
                      />
                    </div>
                  ))}
                  <p className="text-xs text-ink-soft italic">
                    Nothing here is pre-filled. These are your assumptions — change them and
                    the reveal updates live.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  {[
                    { idx: 0, label: "Accounts in play", value: String(play), note: "" },
                    { idx: 1, label: "Payers (PO Signed+)", value: String(payers), note: "" },
                    { idx: 2, label: "Derived CAC", value: cac !== null ? pesoRound(cac) : "Undefined — no payers yet", note: "spend ÷ payers" },
                    {
                      idx: 3,
                      label: "LTV vs CAC",
                      value:
                        cac === null
                          ? ltv > 0 ? pesoRound(ltv) + " · CAC undefined" : "—"
                          : ratio !== null && isFinite(ratio)
                            ? pesoRound(ltv) + " · " + ratio.toFixed(1) + "× CAC"
                            : pesoRound(ltv),
                      note: "annual revenue × margin × years",
                    },
                  ].map((card) => (
                    <div key={card.idx} className="bg-panel border border-line rounded-xl p-5 min-h-28 flex flex-col justify-between">
                      <p className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-soft">
                        {card.label}
                      </p>
                      <p className={`font-display text-[22px] font-semibold mt-2 ${revealStep > card.idx ? "text-ink" : "text-line"}`}>
                        {revealStep > card.idx ? card.value : "—"}
                      </p>
                      {card.note && <p className="text-[10.5px] text-ink-soft italic mt-1.5">{card.note}</p>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === "track" && (
            <div>
              <div className="flex justify-between items-center flex-wrap gap-3 mb-4">
                <button
                  className="bg-coir hover:bg-coir-dark text-white font-semibold text-xs rounded-md px-3.5 py-2.5"
                  onClick={() => openModal(null)}
                >
                  + Add account
                </button>
                <span className="text-xs text-ink-soft">
                  This is the real data the simulator and unit economics project from. Click
                  a card to edit it.
                </span>
              </div>

              <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-5">
                {STAGES.map((stage) => {
                  const items = accounts.filter((a) => a.stage === stage);
                  return (
                    <div key={stage} className="bg-panel/60 border border-line rounded-xl p-3 min-h-24">
                      <div className="flex justify-between items-baseline border-b-2 border-clay/40 pb-2 mb-2.5">
                        <h3 className="font-display text-[13px] font-semibold">{stage}</h3>
                        <span className="font-mono text-xs text-ink-soft">{items.length}</span>
                      </div>
                      {items.length === 0 && (
                        <p className="text-xs text-ink-soft italic px-0.5">No accounts here</p>
                      )}
                      {items.map((a) => (
                        <button
                          key={a.id}
                          className="w-full text-left bg-panel border border-line rounded-lg px-3 py-2.5 mb-2.5 hover:border-coir"
                          onClick={() => openModal(a)}
                        >
                          <p className="font-semibold text-[13px]">{a.name}</p>
                          <p className="text-[11px] text-ink-soft mt-0.5">
                            {a.property}
                            {a.contact ? (a.property ? " · " : "") + a.contact : ""}
                          </p>
                          <div className="flex gap-1.5 flex-wrap mt-2">
                            <SegTag segment={a.segment} />
                            {a.referred_by && (
                              <span className="font-mono text-[10px] px-2 py-0.5 rounded-full border border-amber/60 text-amber">
                                via {a.referred_by}
                              </span>
                            )}
                            {a.generated_referral && (
                              <span className="font-mono text-[10px] px-2 py-0.5 rounded-full border border-amber/60 text-amber">
                                refers others
                              </span>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>

              <div className="mt-7">
                <button
                  className="font-display text-[14.5px] font-semibold text-danger flex items-center gap-2"
                  onClick={() => setGyOpen(!gyOpen)}
                >
                  <span className={`text-[11px] transition-transform ${gyOpen ? "rotate-90" : ""}`}>▶</span>
                  Disqualified — do not re-chase ({graveyard.length})
                </button>
                {gyOpen && (
                  <div className="grid gap-3 mt-3 sm:grid-cols-2 xl:grid-cols-3">
                    {graveyard.map((a) => (
                      <button
                        key={a.id}
                        className="text-left bg-[#FBEBE6] border border-[#E8C4B8] rounded-lg px-3 py-2.5 hover:border-danger"
                        onClick={() => openModal(a)}
                      >
                        <p className="font-semibold text-[13px]">{a.name}</p>
                        <p className="text-[11.5px] text-danger/80 mt-1.5 leading-snug">
                          {a.reason || "No reason logged."}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      <p className="font-mono text-[11px] text-ink-soft mt-4 min-h-4">
        {status || sim.status || econ.status}
      </p>

      {modalOpen && (
        <div
          className="fixed inset-0 bg-ink/40 z-50 flex items-center justify-center p-5"
          onClick={(e) => e.target === e.currentTarget && setModalOpen(false)}
        >
          <div className="bg-panel border border-line rounded-2xl w-full max-w-md p-6 max-h-[88vh] overflow-y-auto">
            <h2 className="font-display text-base font-semibold mb-4">
              {editing ? "Edit account" : "Add account"}
            </h2>
            {[
              { id: "name", label: "Hotel / property", ph: "e.g. Grand Hyatt Manila" },
              { id: "contact", label: "Contact person", ph: "e.g. Denise Ann Samson" },
            ].map((f) => (
              <div key={f.id} className="mb-3.5">
                <label className="block text-[11px] uppercase tracking-wide text-ink-soft mb-1.5">{f.label}</label>
                <input
                  className={inputCls}
                  placeholder={f.ph}
                  value={form[f.id as "name" | "contact"]}
                  onChange={(e) => setForm((p) => ({ ...p, [f.id]: e.target.value }))}
                />
              </div>
            ))}
            <div className="grid grid-cols-2 gap-3 mb-3.5">
              <div>
                <label className="block text-[11px] uppercase tracking-wide text-ink-soft mb-1.5">Segment</label>
                <select className={inputCls} value={form.segment} onChange={(e) => setForm((p) => ({ ...p, segment: e.target.value as "A" | "B" }))}>
                  <option value="A">A — owner-operated, rating-aspiring</option>
                  <option value="B">B — ESG-reporting conglomerate</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wide text-ink-soft mb-1.5">Stage</label>
                <select className={inputCls} value={form.stage} onChange={(e) => setForm((p) => ({ ...p, stage: e.target.value }))}>
                  {[...STAGES, "Disqualified"].map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            {form.stage === "Disqualified" && (
              <div className="mb-3.5">
                <label className="block text-[11px] uppercase tracking-wide text-ink-soft mb-1.5">Why disqualified</label>
                <textarea
                  className={`${inputCls} min-h-16`}
                  placeholder="e.g. Centralized procurement, GM can't decide"
                  value={form.reason}
                  onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))}
                />
              </div>
            )}
            <div className="mb-3.5">
              <label className="block text-[11px] uppercase tracking-wide text-ink-soft mb-1.5">Notes</label>
              <textarea
                className={`${inputCls} min-h-16`}
                placeholder="What's true right now, what's next"
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              />
            </div>
            <div className="mb-3.5">
              <label className="block text-[11px] uppercase tracking-wide text-ink-soft mb-1.5">Referred by (optional)</label>
              <input
                className={inputCls}
                placeholder="e.g. Grand Hyatt Manila"
                value={form.referred_by}
                onChange={(e) => setForm((p) => ({ ...p, referred_by: e.target.value }))}
              />
            </div>
            <label className="flex items-center gap-2 text-[12.5px] mb-4">
              <input
                type="checkbox"
                checked={form.generated_referral}
                onChange={(e) => setForm((p) => ({ ...p, generated_referral: e.target.checked }))}
              />
              This account has generated a referral to someone else
            </label>
            <div className="flex justify-between gap-2.5">
              <div className="flex gap-2">
                <button className="text-xs border border-line rounded-md px-3.5 py-2.5 hover:border-ink-soft" onClick={() => setModalOpen(false)}>
                  Cancel
                </button>
                {editing && (
                  <button className="text-xs border border-[#E8C4B8] text-danger rounded-md px-3.5 py-2.5 hover:bg-[#FBEBE6]" onClick={deleteAccount}>
                    Delete
                  </button>
                )}
              </div>
              <button className="bg-coir hover:bg-coir-dark text-white font-semibold text-xs rounded-md px-4 py-2.5" onClick={saveAccount}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
