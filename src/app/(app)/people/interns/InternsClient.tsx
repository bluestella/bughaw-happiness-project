"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { DISCIPLINES, DISCIPLINE_LABELS, internName, type Discipline, type InternRow } from "@/lib/people";
import { Field } from "../../sales/SalesShell";

type Team = { email: string; note: string | null }[];
type Form = {
  email: string;
  full_name: string;
  discipline: Discipline;
  school: string;
  program: string;
  required_hours: string;
  starts_on: string;
  ends_on: string;
  supervisor_email: string;
};

const blank = (v: string) => (v.trim() === "" ? null : v.trim());
const empty: Form = {
  email: "", full_name: "", discipline: "marketing", school: "", program: "",
  required_hours: "", starts_on: "", ends_on: "", supervisor_email: "",
};
const formOf = (i: InternRow): Form => ({
  email: i.email,
  full_name: i.full_name ?? "",
  discipline: i.discipline,
  school: i.school ?? "",
  program: i.program ?? "",
  required_hours: String(i.required_hours),
  starts_on: i.starts_on ?? "",
  ends_on: i.ends_on ?? "",
  supervisor_email: i.supervisor_email ?? "",
});

function Fields({ form, setForm, team, lockEmail }: { form: Form; setForm: (f: Form) => void; team: Team; lockEmail?: boolean }) {
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label="Intern (invited email)">
        <Select value={form.email} onChange={set("email")} disabled={lockEmail} aria-label="Intern email">
          <option value="">Choose…</option>
          {team.map((t) => (
            <option key={t.email} value={t.email}>
              {t.email}
              {t.note ? ` — ${t.note}` : ""}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Name">
        <Input value={form.full_name} onChange={set("full_name")} />
      </Field>
      <Field label="Area">
        <Select value={form.discipline} onChange={set("discipline")} aria-label="Area">
          {DISCIPLINES.map((d) => (
            <option key={d} value={d}>
              {DISCIPLINE_LABELS[d]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="School">
        <Input value={form.school} onChange={set("school")} />
      </Field>
      <Field label="Program">
        <Input value={form.program} onChange={set("program")} />
      </Field>
      <Field label="Required hours">
        <Input inputMode="numeric" value={form.required_hours} onChange={set("required_hours")} />
      </Field>
      <Field label="Starts">
        <Input type="date" value={form.starts_on} onChange={set("starts_on")} />
      </Field>
      <Field label="Ends">
        <Input type="date" value={form.ends_on} onChange={set("ends_on")} />
      </Field>
      <Field label="Supervisor">
        <Select value={form.supervisor_email} onChange={set("supervisor_email")} aria-label="Supervisor">
          <option value="">None</option>
          {team.map((t) => (
            <option key={t.email} value={t.email}>
              {t.email}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}

export function InternsClient({ interns, team }: { interns: InternRow[]; team: Team }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [form, setForm] = useState<Form>(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Form>(empty);
  const [busy, setBusy] = useState(false);

  function payload(f: Form) {
    const hours = Number(f.required_hours.trim() || 0);
    if (!Number.isInteger(hours) || hours < 0) {
      toast.error("Required hours must be a whole number, 0 or more.");
      return null;
    }
    if (f.starts_on && f.ends_on && f.ends_on < f.starts_on) {
      toast.error("The end date cannot be before the start date.");
      return null;
    }
    return {
      full_name: blank(f.full_name),
      discipline: f.discipline,
      school: blank(f.school),
      program: blank(f.program),
      required_hours: hours,
      starts_on: blank(f.starts_on),
      ends_on: blank(f.ends_on),
      supervisor_email: blank(f.supervisor_email),
    };
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!form.email) return toast.error("Choose the intern's invited email.");
    const body = payload(form);
    if (!body) return;
    setBusy(true);
    const { error } = await supabase.from("people_interns").insert({ email: form.email, ...body });
    setBusy(false);
    if (error) return toast.error(error.code === "23505" ? "That person is already an intern." : error.message);
    setForm(empty);
    toast.success("Intern added.");
    router.refresh();
  }

  async function saveEdit(id: string) {
    const body = payload(editForm);
    if (!body) return;
    setBusy(true);
    const { error } = await supabase.from("people_interns").update(body).eq("id", id);
    setBusy(false);
    if (error) return toast.error(error.message);
    setEditing(null);
    toast.success("Saved.");
    router.refresh();
  }

  async function toggle(i: InternRow) {
    const { error } = await supabase.from("people_interns").update({ is_active: !i.is_active }).eq("id", i.id);
    if (error) return toast.error(error.message);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={add} className="rounded-xl border border-line bg-white p-4 shadow-card" aria-label="Add an intern">
        <h2 className="mb-3 text-sm font-semibold text-ink">Add an intern</h2>
        <Fields form={form} setForm={setForm} team={team} />
        <Button className="mt-3" intent="primary" size="sm" type="submit" disabled={busy}>
          Add intern
        </Button>
        <p className="mt-2 text-[11px] text-ink-soft">
          Intern records are personal data: the intern, their supervisor and a super_admin see them, nobody else.
        </p>
      </form>

      {interns.length === 0 ? (
        <p className="text-[13px] text-ink-soft">No interns yet.</p>
      ) : (
        <ul className="space-y-3">
          {interns.map((i) => (
            <li key={i.id} className="rounded-xl border border-line bg-white p-4 shadow-card">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[14px] font-semibold text-ink">
                  {internName(i)} <span className="font-mono text-[11px] font-normal text-ink-soft">{i.email}</span>
                  {!i.is_active && <span className="ml-2 text-[11px] font-normal text-ink-soft">(inactive)</span>}
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      setEditing(editing === i.id ? null : i.id);
                      setEditForm(formOf(i));
                    }}
                  >
                    {editing === i.id ? "Close" : "Edit"}
                  </Button>
                  <Button size="sm" onClick={() => toggle(i)}>
                    {i.is_active ? "Deactivate" : "Reactivate"}
                  </Button>
                </div>
              </div>
              <p className="mt-1 text-[12px] text-ink-soft">
                {DISCIPLINE_LABELS[i.discipline]}
                {i.school ? ` · ${i.school}` : ""}
                {i.program ? ` · ${i.program}` : ""} · {i.required_hours} h required
                {i.supervisor_email ? ` · supervisor ${i.supervisor_email}` : " · no supervisor"}
              </p>
              {editing === i.id && (
                <div className="mt-3">
                  <Fields form={editForm} setForm={setEditForm} team={team} lockEmail />
                  <Button className="mt-3" intent="primary" size="sm" disabled={busy} onClick={() => saveEdit(i.id)}>
                    Save
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
