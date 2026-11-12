"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DialogBackdrop, DialogDescription, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { manilaDate } from "@/lib/crm";
import { peso } from "@/lib/format";
import { QUOTE_STATUSES, QUOTE_STATUS_LABELS, isExpired, type QuoteRow, type QuoteStatus } from "@/lib/sales";
import { Field, QuoteBadge } from "../SalesShell";

export function QuotesClient({
  quotes,
  accounts,
}: {
  quotes: QuoteRow[];
  accounts: { id: string; name: string }[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const today = useMemo(() => manilaDate(), []);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | QuoteStatus>("all");
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [contact, setContact] = useState("");
  const [creating, setCreating] = useState(false);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return quotes.filter(
      (r) =>
        (status === "all" || r.status === status) &&
        (q === "" || `${r.number} ${r.account_name_snapshot} ${r.contact_name ?? ""}`.toLowerCase().includes(q)),
    );
  }, [quotes, search, status]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!accountId) return;
    setCreating(true);
    const { data, error } = await supabase
      .from("sales_quotations")
      .insert({ account_id: accountId, contact_name: contact.trim() || null })
      .select("id")
      .single();
    setCreating(false);
    if (error || !data) {
      toast.error("Could not create the quotation: " + (error?.message ?? "unknown error"));
      return;
    }
    router.push(`/sales/quotes/${data.id}`);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          className="max-w-xs"
          placeholder="Search number, customer…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search quotations"
        />
        <Select
          className="max-w-[10rem]"
          value={status}
          onChange={(e) => setStatus(e.target.value as "all" | QuoteStatus)}
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          {QUOTE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {QUOTE_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
        <span className="font-mono text-[10px] text-ink-soft">
          {shown.length} of {quotes.length}
        </span>
        <Button intent="primary" size="sm" className="ml-auto" onClick={() => setOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          New quotation
        </Button>
      </div>

      {quotes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line p-10 text-center text-sm text-ink-soft">
          No quotations yet. Start one from a lead in the CRM, or press New quotation.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white shadow-card">
          <table className="w-full min-w-[44rem] text-left text-[13px]" aria-label="Quotations">
            <thead>
              <tr className="border-b border-line">
                {["Number", "Customer", "Status", "Total", "Valid until", "Created"].map((h) => (
                  <th key={h} scope="col" className="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-soft">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="border-b border-line/60 last:border-0 hover:bg-paper">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-[12px]">
                    <Link href={`/sales/quotes/${r.id}`} className="text-coir-dark hover:underline">
                      {r.number}
                      {r.version > 1 ? ` v${r.version}` : ""}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-ink">{r.account_name_snapshot}</td>
                  <td className="px-3 py-2">
                    <QuoteBadge status={r.status} expired={isExpired(r, today)} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-[12px]">{peso(Number(r.total))}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] text-ink-soft">{r.valid_until ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] text-ink-soft">
                    {new Date(r.created_at).toLocaleDateString("en-PH")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <BaseDialog.Root open={open} onOpenChange={setOpen}>
        <BaseDialog.Portal>
          <DialogBackdrop />
          <DialogPopup>
            <DialogTitle>New quotation</DialogTitle>
            <DialogDescription>Pick the customer. You add the lines on the next screen.</DialogDescription>
            <form onSubmit={create} className="mt-4 space-y-3">
              <Field label="Customer">
                <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} required aria-label="Customer">
                  <option value="">Choose a CRM account…</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </Field>
              {accounts.length === 0 && (
                <p className="text-[12px] text-ink-soft">
                  No accounts to choose from. Accounts come from CRM leads, so you need CRM access to start a quotation here.
                </p>
              )}
              <Field label="Contact name (optional)">
                <Input value={contact} onChange={(e) => setContact(e.target.value)} />
              </Field>
              <div className="flex justify-end gap-2 pt-1">
                <Button size="sm" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button intent="primary" size="sm" type="submit" disabled={!accountId || creating}>
                  {creating ? "Creating…" : "Create draft"}
                </Button>
              </div>
            </form>
          </DialogPopup>
        </BaseDialog.Portal>
      </BaseDialog.Root>
    </div>
  );
}
