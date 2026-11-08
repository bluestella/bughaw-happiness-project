"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Minus } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import {
  decideSection,
  resolveSections,
  type RoleDefault,
  type UserOverride,
} from "@/lib/access";
import type { Role } from "@/lib/permissions";

export type AccessSnapshot = {
  sections: Array<{ key: string; label: string; group: string }>;
  defaults: RoleDefault[];
  overrides: UserOverride[];
  people: Array<{ email: string; role: Role; note: string | null }>;
};

type Choice = "default" | "allow" | "deny";
type EditableRole = Exclude<Role, "super_admin">;

const EDITABLE_ROLES: Array<{ role: EditableRole; label: string }> = [
  { role: "member", label: "Member" },
  { role: "contractor", label: "Contractor" },
];

const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Super admin",
  member: "Member",
  contractor: "Contractor",
};

function YesNo({ allowed }: { allowed: boolean }) {
  return allowed ? (
    <span className="inline-flex items-center gap-1 text-coir-dark">
      <Check className="h-3.5 w-3.5" aria-hidden />
      Visible
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-ink-soft">
      <Minus className="h-3.5 w-3.5" aria-hidden />
      Hidden
    </span>
  );
}

function ChoiceGroup({
  value,
  roleDefault,
  label,
  disabled,
  onChange,
}: {
  value: Choice;
  roleDefault: boolean;
  label: string;
  disabled: boolean;
  onChange: (c: Choice) => void;
}) {
  const options: Array<{ id: Choice; text: string }> = [
    { id: "default", text: `Role default (${roleDefault ? "on" : "off"})` },
    { id: "allow", text: "Allow" },
    { id: "deny", text: "Deny" },
  ];
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-line bg-paper p-0.5">
      {options.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => !active && onChange(o.id)}
            className={cn(
              "whitespace-nowrap rounded px-2.5 py-1 text-[12px] transition-colors disabled:opacity-50",
              active
                ? o.id === "deny"
                  ? "bg-danger-bg text-danger font-semibold"
                  : "bg-white text-coir-dark font-semibold shadow-card"
                : "text-ink-soft hover:text-ink"
            )}
          >
            {o.text}
          </button>
        );
      })}
    </div>
  );
}

export function AccessManager({
  initial,
  loadError,
  selfEmail,
}: {
  initial: AccessSnapshot;
  loadError: string | null;
  selfEmail: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [defaults, setDefaults] = useState(initial.defaults);
  const [overrides, setOverrides] = useState(initial.overrides);
  const [busy, setBusy] = useState<string | null>(null);

  const sections = initial.sections;
  const people = initial.people;
  const editablePeople = people.filter((p) => p.role !== "super_admin");
  const [selected, setSelected] = useState<string>(editablePeople[0]?.email ?? "");
  const person = editablePeople.find((p) => p.email === selected) ?? null;

  const groups = useMemo(() => {
    const out: Array<{ group: string; items: typeof sections }> = [];
    for (const s of sections) {
      const g = out.find((x) => x.group === s.group);
      if (g) g.items.push(s);
      else out.push({ group: s.group, items: [s] });
    }
    return out;
  }, [sections]);

  async function setRoleDefault(role: EditableRole, section: string, allowed: boolean) {
    const id = `default:${role}:${section}`;
    const prev = defaults;
    setBusy(id);
    setDefaults((d) => [
      ...d.filter((x) => !(x.role === role && x.section === section)),
      { role, section, allowed },
    ]);
    const { error } = await supabase.rpc("admin_set_role_section_default", {
      p_role: role,
      p_section: section,
      p_allowed: allowed,
    });
    setBusy(null);
    if (error) {
      setDefaults(prev);
      toast.error(error.message);
      return;
    }
    router.refresh();
  }

  async function setOverride(email: string, section: string, choice: Choice) {
    const id = `override:${email}:${section}`;
    const prev = overrides;
    const allowed = choice === "default" ? null : choice === "allow";
    setBusy(id);
    setOverrides((o) => {
      const rest = o.filter((x) => !(x.email.toLowerCase() === email && x.section === section));
      return allowed === null ? rest : [...rest, { email, section, allowed }];
    });
    const { error } = await supabase.rpc("admin_set_user_section", {
      p_email: email,
      p_section: section,
      p_allowed: allowed,
    });
    setBusy(null);
    if (error) {
      setOverrides(prev);
      toast.error(error.message);
      return;
    }
    router.refresh();
  }

  async function resetPerson(email: string) {
    const mine = overrides.filter((o) => o.email.toLowerCase() === email);
    if (!mine.length) return;
    setBusy(`reset:${email}`);
    const results = await Promise.all(
      mine.map((o) =>
        supabase.rpc("admin_set_user_section", {
          p_email: email,
          p_section: o.section,
          p_allowed: null,
        })
      )
    );
    setBusy(null);
    const cleared = new Set(mine.filter((_, i) => !results[i].error).map((o) => o.section));
    setOverrides((o) =>
      o.filter((x) => !(x.email.toLowerCase() === email && cleared.has(x.section)))
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) toast.error(failed.error.message);
    else toast.success(`${email} is back on role defaults.`);
    router.refresh();
  }

  return (
    <div className="space-y-8">
      {loadError && (
        <p className="rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-[13px] text-danger">
          {loadError}
        </p>
      )}

      {/* ---------- Role defaults ---------- */}
      <section aria-labelledby="role-defaults-heading">
        <h2 id="role-defaults-heading" className="mb-1 text-[15px] font-semibold text-ink">
          Role defaults
        </h2>
        <p className="mb-3 text-[13px] text-ink-soft">
          What a new member or contractor sees before you set anything for them. Super admins
          always see every section.
        </p>
        <div className="overflow-x-auto rounded-xl border border-line bg-white shadow-card">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-line text-[11px] uppercase tracking-[0.06em] text-ink-soft">
                <th className="px-4 py-2.5 font-semibold">Section</th>
                {EDITABLE_ROLES.map((r) => (
                  <th key={r.role} className="px-4 py-2.5 text-center font-semibold">
                    {r.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <GroupRows key={g.group} group={g.group} colSpan={EDITABLE_ROLES.length + 1}>
                  {g.items.map((s) => (
                    <tr key={s.key} className="border-b border-line last:border-b-0">
                      <td className="px-4 py-2 text-ink">{s.label}</td>
                      {EDITABLE_ROLES.map((r) => {
                        const on = decideSection(r.role, "", s.key, defaults, []).allowed;
                        return (
                          <td key={r.role} className="px-4 py-2 text-center">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-coir"
                              aria-label={`${r.label}s see ${s.label} by default`}
                              checked={on}
                              disabled={busy !== null}
                              onChange={(e) => setRoleDefault(r.role, s.key, e.target.checked)}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </GroupRows>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------- Per-person overrides ---------- */}
      <section aria-labelledby="people-heading">
        <h2 id="people-heading" className="mb-1 text-[15px] font-semibold text-ink">
          Per-person access
        </h2>
        <p className="mb-3 text-[13px] text-ink-soft">
          Override a section for one person. Changes apply on their next page load.
        </p>

        {editablePeople.length === 0 ? (
          <p className="rounded-xl border border-line bg-white p-5 text-[13px] text-ink-soft shadow-card">
            No members or contractors on the allowlist yet. Add people on the Allowlist page first.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[240px] flex-1 sm:max-w-sm">
                <label htmlFor="access-person" className="mb-1 block text-[11px] font-semibold text-ink-soft">
                  Person
                </label>
                <Select id="access-person" value={selected} onChange={(e) => setSelected(e.target.value)}>
                  {editablePeople.map((p) => {
                    const count = resolveSections(p.role, p.email, defaults, overrides).size;
                    return (
                      <option key={p.email} value={p.email}>
                        {p.email} — {ROLE_LABEL[p.role]}, {count}/{sections.length}
                      </option>
                    );
                  })}
                </Select>
              </div>
              {person && overrides.some((o) => o.email.toLowerCase() === person.email) && (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => resetPerson(person.email)}
                  className="text-[12px] font-semibold text-coir hover:text-coir-dark disabled:opacity-50"
                >
                  Reset to role defaults
                </button>
              )}
            </div>

            {person && (
              <div className="overflow-x-auto rounded-xl border border-line bg-white shadow-card">
                <table className="w-full text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-line text-[11px] uppercase tracking-[0.06em] text-ink-soft">
                      <th className="px-4 py-2.5 font-semibold">Section</th>
                      <th className="px-4 py-2.5 font-semibold">Setting</th>
                      <th className="px-4 py-2.5 font-semibold">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((g) => (
                      <GroupRows key={g.group} group={g.group} colSpan={3}>
                        {g.items.map((s) => {
                          const d = decideSection(person.role, person.email, s.key, defaults, overrides);
                          const value: Choice =
                            d.source === "override" ? (d.allowed ? "allow" : "deny") : "default";
                          return (
                            <tr key={s.key} className="border-b border-line last:border-b-0">
                              <td className="px-4 py-2 text-ink">{s.label}</td>
                              <td className="px-4 py-2">
                                <ChoiceGroup
                                  label={`${s.label} for ${person.email}`}
                                  value={value}
                                  roleDefault={d.roleDefault}
                                  disabled={busy !== null}
                                  onChange={(c) => setOverride(person.email, s.key, c)}
                                />
                              </td>
                              <td className="px-4 py-2 text-[12px]">
                                <YesNo allowed={d.allowed} />
                              </td>
                            </tr>
                          );
                        })}
                      </GroupRows>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {people.some((p) => p.role === "super_admin") && (
          <p className="mt-3 text-[12px] text-ink-soft">
            Super admins (always full access):{" "}
            {people
              .filter((p) => p.role === "super_admin")
              .map((p) => (p.email === selfEmail ? `${p.email} (you)` : p.email))
              .join(", ")}
          </p>
        )}
      </section>
    </div>
  );
}

function GroupRows({
  group,
  colSpan,
  children,
}: {
  group: string;
  colSpan: number;
  children: React.ReactNode;
}) {
  return (
    <>
      <tr className="border-b border-line bg-paper">
        <th
          scope="colgroup"
          colSpan={colSpan}
          className="px-4 py-1.5 font-mono text-[10px] font-normal uppercase tracking-[0.1em] text-ink-soft"
        >
          {group}
        </th>
      </tr>
      {children}
    </>
  );
}
