"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export type AllowedEmailRow = {
  email: string;
  note: string;
  role: "super_admin" | "member" | "contractor";
  added_at: string;
};

const ROLE_LABEL: Record<AllowedEmailRow["role"], string> = {
  super_admin: "Super admin",
  member: "Member",
  contractor: "Contractor",
};

export function AllowlistManager({
  initialRows,
  loadError,
}: {
  initialRows: AllowedEmailRow[];
  loadError: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [role, setRole] = useState<AllowedEmailRow["role"]>("member");
  const [saving, setSaving] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);

  async function addEmail(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setSaving(true);
    const { error } = await supabase.rpc("admin_add_allowed_email", {
      p_email: trimmed,
      p_note: note.trim(),
      p_role: role,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows((prev) => [
      { email: trimmed, note: note.trim(), role, added_at: new Date().toISOString() },
      ...prev.filter((r) => r.email !== trimmed),
    ]);
    setEmail("");
    setNote("");
    setRole("member");
    toast.success(`${trimmed} can now sign up or be invited.`);
    router.refresh();
  }

  async function removeEmail(target: string) {
    const { error } = await supabase.rpc("admin_remove_allowed_email", { p_email: target });
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows((prev) => prev.filter((r) => r.email !== target));
    toast.success(`${target} removed from the allowlist.`);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {loadError && (
        <p className="rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-[13px] text-danger">
          {loadError}
        </p>
      )}

      <form
        onSubmit={addEmail}
        className="flex flex-wrap items-end gap-2 rounded-xl border border-line bg-white p-4 shadow-card"
      >
        <div className="min-w-[200px] flex-1">
          <label className="mb-1 block text-[11px] font-semibold text-ink-soft" htmlFor="allowlist-email">
            Email
          </label>
          <Input
            id="allowlist-email"
            type="email"
            required
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="min-w-[160px] flex-1">
          <label className="mb-1 block text-[11px] font-semibold text-ink-soft" htmlFor="allowlist-note">
            Note (optional)
          </label>
          <Input
            id="allowlist-note"
            placeholder="e.g. sales lead"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <div className="min-w-[140px]">
          <label className="mb-1 block text-[11px] font-semibold text-ink-soft" htmlFor="allowlist-role">
            Role
          </label>
          <Select
            id="allowlist-role"
            value={role}
            onChange={(e) => setRole(e.target.value as AllowedEmailRow["role"])}
          >
            <option value="member">Member</option>
            <option value="contractor">Contractor</option>
            <option value="super_admin">Super admin</option>
          </Select>
        </div>
        <Button intent="primary" type="submit" disabled={saving || !email.trim()}>
          <Plus className="mr-1.5 h-4 w-4" aria-hidden />
          {saving ? "Adding…" : "Add"}
        </Button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-line bg-white shadow-card">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-line text-[11px] uppercase tracking-[0.06em] text-ink-soft">
              <th className="px-4 py-2.5 font-semibold">Email</th>
              <th className="px-4 py-2.5 font-semibold">Role</th>
              <th className="px-4 py-2.5 font-semibold">Note</th>
              <th className="px-4 py-2.5 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-ink-soft">
                  No allowed emails yet.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.email} className="border-b border-line last:border-b-0">
                <td className="px-4 py-2.5 font-mono text-[12px] text-ink">{r.email}</td>
                <td className="px-4 py-2.5 text-ink-soft">{ROLE_LABEL[r.role]}</td>
                <td className="px-4 py-2.5 text-ink-soft">{r.note || "—"}</td>
                <td className="px-4 py-2.5 text-right">
                  <Button
                    intent="ghost"
                    size="sm"
                    aria-label={`Remove ${r.email} from the allowlist`}
                    onClick={() => setPendingRemove(r.email)}
                  >
                    <Trash2 className="h-4 w-4 text-danger" aria-hidden />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={pendingRemove !== null}
        onOpenChange={(open) => !open && setPendingRemove(null)}
        title="Remove from allowlist?"
        description={
          pendingRemove
            ? `${pendingRemove} will no longer be able to sign up or sign in.`
            : undefined
        }
        confirmLabel="Remove"
        onConfirm={() => {
          if (pendingRemove) return removeEmail(pendingRemove);
        }}
      />
    </div>
  );
}
