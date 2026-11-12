"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { DialogBackdrop, DialogPopup } from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { canDeleteLead, canEditLead, type Role } from "@/lib/permissions";
import {
  BUYER_SEGMENTS,
  BUYER_SEGMENT_LABELS,
  LEAD_STATUSES,
  LOST_REASONS,
  LOST_REASON_LABELS,
  NEXT_ACTION_MAX,
  ORIGIN_FORM_LABELS,
  dealDraftFrom,
  describeDealChange,
  isOverdue,
  manilaDate,
  productLabel,
  validateDeal,
  type BuyerSegment,
  type CrmActivity,
  type CrmLeadRow,
  type DealDraft,
  type LeadStatus,
  type LostReason,
} from "@/lib/crm";
import { peso } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-2 py-1">
      <span className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">
        {label}
      </span>
      <span className="text-[13px] text-ink break-words">{children}</span>
    </div>
  );
}

const ACTIVITY_COLUMNS =
  "id, lead_id, kind, body, from_status, to_status, author_email, created_at";

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">
        {label}
      </span>
      {children}
      {error && (
        <span role="alert" className="mt-1 block text-[11px] text-danger">
          {error}
        </span>
      )}
    </label>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  return (
    <details className="mt-2 rounded-lg border border-line bg-paper p-2">
      <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-wide text-ink-soft">
        {label}
      </summary>
      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all text-[11px] text-ink">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

export function LeadPanel({
  lead,
  role,
  canQuote = false,
  askLostReason = false,
  onClose,
  onUpdated,
  onDeleted,
}: {
  lead: CrmLeadRow;
  role: Role | null;
  /** The person has the 'sales' section, so this lead can start a quotation. */
  canQuote?: boolean;
  /** Open with the "why was it lost?" prompt showing (a card was dropped on Closed Lost). */
  askLostReason?: boolean;
  onClose: () => void;
  onUpdated: (lead: CrmLeadRow) => void;
  onDeleted: (leadId: string) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [quoting, setQuoting] = useState(false);
  const editable = canEditLead(role);
  const deletable = canDeleteLead(role);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [status, setStatus] = useState<LeadStatus>(lead.status);
  const [saving, setSaving] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [activities, setActivities] = useState<CrmActivity[]>([]);
  const [activitiesLoaded, setActivitiesLoaded] = useState(false);
  const [note, setNote] = useState("");
  const [lostPrompt, setLostPrompt] = useState(askLostReason);
  const [lostReason, setLostReason] = useState<LostReason | "">("");
  const [draft, setDraft] = useState<DealDraft>(() => dealDraftFrom(lead));
  const [dealErrors, setDealErrors] = useState<Partial<Record<keyof DealDraft, string>>>({});
  const [savingDeal, setSavingDeal] = useState(false);
  const today = useMemo(() => manilaDate(), []);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("crm_lead_activities")
        .select(ACTIVITY_COLUMNS)
        .eq("lead_id", lead.id)
        .order("created_at", { ascending: true });
      if (error) toast.error("Could not load activity: " + error.message);
      setActivities((data ?? []) as CrmActivity[]);
      setActivitiesLoaded(true);
    })();
  }, [supabase, lead.id]);

  async function changeStatus(next: LeadStatus, reason?: LostReason) {
    if (next === lead.status) return;
    // The database refuses Closed Lost without a reason (0014), so ask first.
    if (next === "Closed Lost" && !reason) {
      setLostPrompt(true);
      return;
    }
    const previous = lead.status;
    const nextReason = next === "Closed Lost" ? (reason ?? null) : null;
    setStatus(next);
    setSaving(true);
    const { data, error } = await supabase
      .from("crm_leads")
      .update({
        status: next,
        lost_reason: nextReason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", lead.id)
      .select("id")
      .maybeSingle();
    setSaving(false);
    if (error || !data) {
      setStatus(previous);
      toast.error(
        error
          ? error.message
          : "You don't have permission to update this lead.",
      );
      return;
    }

    const { data: activity } = await supabase
      .from("crm_lead_activities")
      .insert({
        lead_id: lead.id,
        kind: "status_change",
        body: nextReason
          ? `${previous} → ${next} (${LOST_REASON_LABELS[nextReason]})`
          : `${previous} → ${next}`,
        from_status: previous,
        to_status: next,
      })
      .select(ACTIVITY_COLUMNS)
      .single();
    if (activity) setActivities((prev) => [...prev, activity as CrmActivity]);

    setLostPrompt(false);
    setLostReason("");
    onUpdated({ ...lead, status: next, lost_reason: nextReason });
    toast.success("Status updated.");
  }

  async function saveDeal(e: React.FormEvent) {
    e.preventDefault();
    const result = validateDeal(draft);
    if (!result.ok) {
      setDealErrors(result.errors);
      return;
    }
    setDealErrors({});
    const change = describeDealChange(lead, result.patch);
    if (!change) {
      toast.success("Nothing to save.");
      return;
    }
    setSavingDeal(true);
    const { data, error } = await supabase
      .from("crm_leads")
      .update({ ...result.patch, updated_at: new Date().toISOString() })
      .eq("id", lead.id)
      .select("id")
      .maybeSingle();
    setSavingDeal(false);
    if (error || !data) {
      toast.error(
        error
          ? "Could not save the deal: " + error.message
          : "You don't have permission to update this lead.",
      );
      return;
    }
    const { data: activity } = await supabase
      .from("crm_lead_activities")
      .insert({ lead_id: lead.id, kind: "system", body: change })
      .select(ACTIVITY_COLUMNS)
      .single();
    if (activity) setActivities((prev) => [...prev, activity as CrmActivity]);
    setDraft(dealDraftFrom(result.patch));
    onUpdated({ ...lead, ...result.patch });
    toast.success("Deal saved.");
  }

  async function changeSegment(next: BuyerSegment | "") {
    const account = lead.crm_accounts;
    if (!account) return;
    const segment = next === "" ? null : next;
    const { data, error } = await supabase
      .from("crm_accounts")
      .update({ segment, updated_at: new Date().toISOString() })
      .eq("id", account.id)
      .select("id")
      .maybeSingle();
    if (error || !data) {
      toast.error(
        error
          ? "Could not save the segment: " + error.message
          : "You don't have permission to update this account.",
      );
      return;
    }
    onUpdated({ ...lead, crm_accounts: { ...account, segment } });
    toast.success("Segment saved.");
  }

  const setField = (key: keyof DealDraft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft((prev) => ({ ...prev, [key]: e.target.value }));

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    const body = note.trim();
    if (!body) return;
    const { data, error } = await supabase
      .from("crm_lead_activities")
      .insert({ lead_id: lead.id, kind: "note", body })
      .select(ACTIVITY_COLUMNS)
      .single();
    if (error || !data) {
      toast.error("Could not add note: " + (error?.message ?? "unknown error"));
      return;
    }
    setActivities((prev) => [...prev, data as CrmActivity]);
    setNote("");
    toast.success("Note added.");
  }

  /**
   * Promote into the Pipeline Simulator so the CAC/LTV math keeps its inputs.
   * Idempotent: once `pipeline_account_id` is set the button becomes a link.
   */
  async function promoteToPipeline() {
    setPromoting(true);
    const contact = lead.crm_contacts;
    const account = lead.crm_accounts;
    const { data, error } = await supabase
      .from("pipeline_accounts")
      .insert({
        name: account?.name || contact?.full_name || "Untitled account",
        property: account?.hotel_room_count_band
          ? `${account.hotel_room_count_band} rooms`
          : (account?.hotel_star_rating ?? ""),
        segment: "A",
        stage: "Warm Contact",
        contact: [contact?.full_name, contact?.job_title]
          .filter(Boolean)
          .join(" — "),
        notes: lead.description ?? "",
        referred_by: lead.source ?? "",
      })
      .select("id")
      .single();

    if (error || !data) {
      setPromoting(false);
      toast.error(
        "Could not create the pipeline account: " +
          (error?.message ?? "unknown error"),
      );
      return;
    }

    const pipelineId = data.id as string;
    const { error: linkError } = await supabase
      .from("crm_leads")
      .update({ pipeline_account_id: pipelineId })
      .eq("id", lead.id);
    setPromoting(false);
    if (linkError) {
      toast.error(
        "Pipeline account created, but the link failed: " + linkError.message,
      );
      return;
    }

    await supabase.from("crm_lead_activities").insert({
      lead_id: lead.id,
      kind: "system",
      body: "Promoted to a pipeline account",
    });
    onUpdated({ ...lead, pipeline_account_id: pipelineId });
    toast.success("Added to the Pipeline Simulator.");
  }

  /** Starts a draft quotation for this lead's account and opens it. */
  async function startQuotation() {
    if (!lead.account_id) return;
    setQuoting(true);
    const { data, error } = await supabase
      .from("sales_quotations")
      .insert({
        account_id: lead.account_id,
        lead_id: lead.id,
        contact_name: lead.crm_contacts?.full_name || null,
      })
      .select("id")
      .single();
    setQuoting(false);
    if (error || !data) {
      toast.error("Could not start the quotation: " + (error?.message ?? "unknown error"));
      return;
    }
    router.push(`/sales/quotes/${data.id}`);
  }

  async function deleteLead() {
    const { error } = await supabase.rpc("admin_delete_lead", {
      p_lead_id: lead.id,
    });
    if (error) {
      toast.error("Could not delete the lead: " + error.message);
      return;
    }
    toast.success("Lead deleted.");
    onDeleted(lead.id);
  }

  const contact = lead.crm_contacts;
  const account = lead.crm_accounts;
  const leadLabel = account?.name || contact?.full_name || "Unnamed lead";

  return (
    <>
      <BaseDialog.Root open onOpenChange={(o) => !o && onClose()}>
        <BaseDialog.Portal>
          <DialogBackdrop />
          <DialogPopup
            unpadded
            className="max-h-[calc(100vh-4rem)] max-w-xl overflow-y-auto"
          >
            <div className="flex items-start justify-between gap-3 border-b border-line p-5">
              <div className="min-w-0">
                <BaseDialog.Title className="text-base font-semibold text-ink">
                  {account?.name || contact?.full_name || "Lead"}
                </BaseDialog.Title>
                <BaseDialog.Description className="text-[11px] text-ink-soft">
                  {ORIGIN_FORM_LABELS[lead.origin_form]} ·{" "}
                  {new Date(lead.submitted_at).toLocaleString("en-PH")}
                </BaseDialog.Description>
              </div>
              <BaseDialog.Close
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-md text-ink-soft transition-colors hover:bg-paper hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-coir/30"
              >
                <X className="h-4 w-4" aria-hidden />
              </BaseDialog.Close>
            </div>

            <div className="border-b border-line p-5">
              <label className="block max-w-xs">
                <span className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">
                  Status
                </span>
                <Select
                  value={status}
                  disabled={!editable || saving}
                  onChange={(e) => changeStatus(e.target.value as LeadStatus)}
                >
                  {LEAD_STATUSES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </Select>
              </label>
              {status === "Closed Lost" && lead.lost_reason && !lostPrompt && (
                <p className="mt-2 text-[12px] text-ink-soft">
                  Lost reason: {LOST_REASON_LABELS[lead.lost_reason]}
                </p>
              )}
              {lostPrompt && editable && (
                <div className="mt-3 rounded-lg border border-danger-border bg-danger-bg p-3">
                  <Field label="Why was this deal lost?">
                    <Select
                      value={lostReason}
                      onChange={(e) => setLostReason(e.target.value as LostReason | "")}
                      aria-label="Lost reason"
                    >
                      <option value="">Choose a reason…</option>
                      {LOST_REASONS.map((r) => (
                        <option key={r} value={r}>
                          {LOST_REASON_LABELS[r]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <div className="mt-2 flex gap-2">
                    <Button
                      intent="danger"
                      size="sm"
                      disabled={!lostReason || saving}
                      onClick={() => lostReason && changeStatus("Closed Lost", lostReason)}
                    >
                      Mark as lost
                    </Button>
                    <Button
                      intent="secondary"
                      size="sm"
                      onClick={() => {
                        setLostPrompt(false);
                        setLostReason("");
                        setStatus(lead.status);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
              {!editable && (
                <p className="mt-2 text-[11px] text-ink-soft">
                  Read-only for your role.
                </p>
              )}
            </div>

            <form onSubmit={saveDeal} className="border-b border-line p-5" noValidate>
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold text-ink">Deal</h3>
                {lead.deal_value !== null && (
                  <span className="font-mono text-[12px] text-ink">
                    {peso(Number(lead.deal_value))}
                  </span>
                )}
              </div>
              {isOverdue(lead, today) && (
                <p className="mb-3 rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-[12px] text-danger">
                  Follow-up overdue since {lead.next_action_due_on}.
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Deal value (₱)" error={dealErrors.deal_value}>
                  <Input
                    inputMode="decimal"
                    placeholder="0.00"
                    value={draft.deal_value}
                    onChange={setField("deal_value")}
                    disabled={!editable}
                  />
                </Field>
                <Field label="Expected close" error={dealErrors.expected_close_on}>
                  <Input
                    type="date"
                    value={draft.expected_close_on}
                    onChange={setField("expected_close_on")}
                    disabled={!editable}
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Next action" error={dealErrors.next_action}>
                    <Input
                      placeholder="e.g. Send revised quotation"
                      maxLength={NEXT_ACTION_MAX}
                      value={draft.next_action}
                      onChange={setField("next_action")}
                      disabled={!editable}
                    />
                  </Field>
                </div>
                <Field label="Next action due" error={dealErrors.next_action_due_on}>
                  <Input
                    type="date"
                    value={draft.next_action_due_on}
                    onChange={setField("next_action_due_on")}
                    disabled={!editable}
                  />
                </Field>
                {account ? (
                  <Field label="Buyer segment">
                    <Select
                      value={account.segment ?? ""}
                      disabled={!editable}
                      onChange={(e) => changeSegment(e.target.value as BuyerSegment | "")}
                    >
                      <option value="">Not set</option>
                      {BUYER_SEGMENTS.map((seg) => (
                        <option key={seg} value={seg}>
                          {BUYER_SEGMENT_LABELS[seg]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                ) : (
                  <span />
                )}
                <Field label="Sample sent" error={dealErrors.sample_sent_on}>
                  <Input
                    type="date"
                    value={draft.sample_sent_on}
                    onChange={setField("sample_sent_on")}
                    disabled={!editable}
                  />
                </Field>
                <Field label="Sample feedback" error={dealErrors.sample_feedback_on}>
                  <Input
                    type="date"
                    value={draft.sample_feedback_on}
                    onChange={setField("sample_feedback_on")}
                    disabled={!editable}
                  />
                </Field>
              </div>
              {editable && (
                <Button
                  className="mt-3"
                  intent="primary"
                  size="sm"
                  type="submit"
                  disabled={savingDeal}
                >
                  {savingDeal ? "Saving…" : "Save deal"}
                </Button>
              )}
            </form>

            <div className="border-b border-line p-5">
              <h3 className="mb-2 text-sm font-semibold text-ink">
                Submission
              </h3>
              {contact && (
                <>
                  <Row label="Name">{contact.full_name || "—"}</Row>
                  <Row label="Email">
                    <a
                      className="text-coir-dark hover:underline"
                      href={`mailto:${contact.email}`}
                    >
                      {contact.email}
                    </a>
                  </Row>
                  {contact.job_title && (
                    <Row label="Role">{contact.job_title}</Row>
                  )}
                </>
              )}
              {account && (
                <>
                  <Row label="Account">{account.name}</Row>
                  {account.hotel_star_rating && (
                    <Row label="Star rating">{account.hotel_star_rating}</Row>
                  )}
                  {account.hotel_room_count_band && (
                    <Row label="Room count">
                      {account.hotel_room_count_band}
                    </Row>
                  )}
                </>
              )}
              {lead.source && <Row label="Heard via">{lead.source}</Row>}
              {lead.product_interests.length > 0 && (
                <Row label="Interests">
                  <span className="flex flex-wrap gap-1.5">
                    {lead.product_interests.map((id) => (
                      <span
                        key={id}
                        className="rounded-full border border-coir/50 px-2 py-0.5 text-[11px] text-coir-dark"
                      >
                        {productLabel(id)}
                      </span>
                    ))}
                  </span>
                </Row>
              )}
              {lead.product_of_interest && (
                <Row label="Product">{lead.product_of_interest}</Row>
              )}
              {lead.estimated_volume && (
                <Row label="Volume">{lead.estimated_volume}</Row>
              )}
              {lead.engagement_tier && (
                <Row label="Engagement">
                  {lead.engagement_tier.replace("_", " ")}
                </Row>
              )}
              {lead.ga_client_id && (
                <Row label="GA client id">{lead.ga_client_id}</Row>
              )}
              {lead.description && (
                <div className="mt-3">
                  <p className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">
                    Message
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-[13px] text-ink">
                    {lead.description}
                  </p>
                </div>
              )}

              <JsonBlock label="Attribution" value={lead.attribution} />
              <JsonBlock label="Engagement" value={lead.engagement} />
              <JsonBlock label="Geo" value={lead.geo} />
            </div>

            <div className="border-b border-line p-5">
              <h3 className="mb-2 text-sm font-semibold text-ink">
                Pipeline Simulator
              </h3>
              {lead.pipeline_account_id ? (
                <p className="text-[12px] text-ink-soft">
                  Tracked as a pipeline account.{" "}
                  <Link
                    href="/tools/pipeline"
                    className="text-coir-dark hover:underline"
                  >
                    Open the simulator →
                  </Link>
                </p>
              ) : (
                <div>
                  <p className="mb-2 text-[12px] text-ink-soft">
                    Promote this lead into a pipeline account so it feeds the
                    CAC / LTV math.
                  </p>
                  <Button
                    intent="secondary"
                    size="sm"
                    disabled={!editable || promoting}
                    onClick={promoteToPipeline}
                  >
                    {promoting ? "Promoting…" : "Promote to pipeline account"}
                  </Button>
                </div>
              )}
            </div>

            {canQuote && (
              <div className="border-b border-line p-5">
                <h3 className="mb-2 text-sm font-semibold text-ink">Quotation</h3>
                {lead.account_id ? (
                  <Button intent="secondary" size="sm" disabled={!editable || quoting} onClick={startQuotation}>
                    {quoting ? "Starting…" : "New quotation"}
                  </Button>
                ) : (
                  <p className="text-[12px] text-ink-soft">
                    This lead has no company account, so a quotation cannot be started from it.
                  </p>
                )}
              </div>
            )}

            <div className="p-5">
              <h3 className="mb-3 text-sm font-semibold text-ink">Activity</h3>
              {!activitiesLoaded && (
                <p className="text-[12px] text-ink-soft">Loading…</p>
              )}
              {activitiesLoaded && activities.length === 0 && (
                <p className="mb-3 text-[12px] text-ink-soft">
                  Nothing logged yet.
                </p>
              )}
              <ul className="mb-3 space-y-3">
                {activities.map((a) => (
                  <li key={a.id}>
                    <p className="font-mono text-[10px] text-ink-soft">
                      {a.author_email} ·{" "}
                      {new Date(a.created_at).toLocaleString("en-PH")}
                      {a.kind !== "note" && ` · ${a.kind.replace("_", " ")}`}
                    </p>
                    <p className="whitespace-pre-wrap text-[13px] text-ink">
                      {a.body}
                    </p>
                  </li>
                ))}
              </ul>
              {editable && (
                <form onSubmit={addNote} className="flex gap-2">
                  <Input
                    placeholder="Add a note…"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                  <Button
                    intent="primary"
                    size="sm"
                    type="submit"
                    disabled={!note.trim()}
                  >
                    Post
                  </Button>
                </form>
              )}
            </div>

            {deletable && (
              <div className="border-t border-line p-5">
                <h3 className="mb-1 text-sm font-semibold text-danger">
                  Danger zone
                </h3>
                <p className="mb-3 text-[12px] text-ink-soft">
                  Permanently removes this lead and its activity log. Super
                  admins only.
                </p>
                <Button
                  intent="danger"
                  size="sm"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  Delete lead
                </Button>
              </div>
            )}
          </DialogPopup>
        </BaseDialog.Portal>
      </BaseDialog.Root>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete “${leadLabel}”?`}
        description={`This permanently removes the lead and its activity log${
          lead.pipeline_account_id ? ", plus its pipeline account" : ""
        }. Its contact and account are removed too if no other lead uses them. This cannot be undone.`}
        confirmLabel="Delete lead"
        onConfirm={deleteLead}
      />
    </>
  );
}
