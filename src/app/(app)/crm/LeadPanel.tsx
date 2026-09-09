"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { toast } from "sonner";
import { DialogBackdrop, DialogPopup } from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { canEditLead, type Role } from "@/lib/permissions";
import {
  LEAD_STATUSES,
  ORIGIN_FORM_LABELS,
  productLabel,
  type CrmActivity,
  type CrmLeadRow,
  type LeadStatus,
} from "@/lib/crm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-2 py-1">
      <span className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">{label}</span>
      <span className="text-[13px] text-ink break-words">{children}</span>
    </div>
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
  onClose,
  onUpdated,
}: {
  lead: CrmLeadRow;
  role: Role | null;
  onClose: () => void;
  onUpdated: (lead: CrmLeadRow) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const editable = canEditLead(role);

  const [status, setStatus] = useState<LeadStatus>(lead.status);
  const [saving, setSaving] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [activities, setActivities] = useState<CrmActivity[]>([]);
  const [activitiesLoaded, setActivitiesLoaded] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("crm_lead_activities")
        .select("id, lead_id, kind, body, from_status, to_status, author_email, created_at")
        .eq("lead_id", lead.id)
        .order("created_at", { ascending: true });
      if (error) toast.error("Could not load activity: " + error.message);
      setActivities((data ?? []) as CrmActivity[]);
      setActivitiesLoaded(true);
    })();
  }, [supabase, lead.id]);

  async function changeStatus(next: LeadStatus) {
    if (next === lead.status) return;
    const previous = lead.status;
    setStatus(next);
    setSaving(true);
    const { data, error } = await supabase
      .from("crm_leads")
      .update({ status: next, updated_at: new Date().toISOString() })
      .eq("id", lead.id)
      .select("id")
      .maybeSingle();
    setSaving(false);
    if (error || !data) {
      setStatus(previous);
      toast.error(error ? error.message : "You don't have permission to update this lead.");
      return;
    }

    const { data: activity } = await supabase
      .from("crm_lead_activities")
      .insert({
        lead_id: lead.id,
        kind: "status_change",
        body: `${previous} → ${next}`,
        from_status: previous,
        to_status: next,
      })
      .select("id, lead_id, kind, body, from_status, to_status, author_email, created_at")
      .single();
    if (activity) setActivities((prev) => [...prev, activity as CrmActivity]);

    onUpdated({ ...lead, status: next });
    toast.success("Status updated.");
  }

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    const body = note.trim();
    if (!body) return;
    const { data, error } = await supabase
      .from("crm_lead_activities")
      .insert({ lead_id: lead.id, kind: "note", body })
      .select("id, lead_id, kind, body, from_status, to_status, author_email, created_at")
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
          : account?.hotel_star_rating ?? "",
        segment: "A",
        stage: "Warm Contact",
        contact: [contact?.full_name, contact?.job_title].filter(Boolean).join(" — "),
        notes: lead.description,
        referred_by: lead.source,
      })
      .select("id")
      .single();

    if (error || !data) {
      setPromoting(false);
      toast.error("Could not create the pipeline account: " + (error?.message ?? "unknown error"));
      return;
    }

    const pipelineId = data.id as string;
    const { error: linkError } = await supabase
      .from("crm_leads")
      .update({ pipeline_account_id: pipelineId })
      .eq("id", lead.id);
    setPromoting(false);
    if (linkError) {
      toast.error("Pipeline account created, but the link failed: " + linkError.message);
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

  const contact = lead.crm_contacts;
  const account = lead.crm_accounts;

  return (
    <BaseDialog.Root open onOpenChange={(o) => !o && onClose()}>
      <BaseDialog.Portal>
        <DialogBackdrop />
        <DialogPopup unpadded className="max-h-[calc(100vh-4rem)] max-w-xl overflow-y-auto">
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
            {!editable && (
              <p className="mt-2 text-[11px] text-ink-soft">Read-only for your role.</p>
            )}
          </div>

          <div className="border-b border-line p-5">
            <h3 className="mb-2 text-sm font-semibold text-ink">Submission</h3>
            {contact && (
              <>
                <Row label="Name">{contact.full_name || "—"}</Row>
                <Row label="Email">
                  <a className="text-coir-dark hover:underline" href={`mailto:${contact.email}`}>
                    {contact.email}
                  </a>
                </Row>
                {contact.job_title && <Row label="Role">{contact.job_title}</Row>}
              </>
            )}
            {account && (
              <>
                <Row label="Account">{account.name}</Row>
                {account.hotel_star_rating && (
                  <Row label="Star rating">{account.hotel_star_rating}</Row>
                )}
                {account.hotel_room_count_band && (
                  <Row label="Room count">{account.hotel_room_count_band}</Row>
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
            {lead.product_of_interest && <Row label="Product">{lead.product_of_interest}</Row>}
            {lead.estimated_volume && <Row label="Volume">{lead.estimated_volume}</Row>}
            {lead.engagement_tier && (
              <Row label="Engagement">{lead.engagement_tier.replace("_", " ")}</Row>
            )}
            {lead.ga_client_id && <Row label="GA client id">{lead.ga_client_id}</Row>}
            {lead.description && (
              <div className="mt-3">
                <p className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">
                  Message
                </p>
                <p className="mt-1 whitespace-pre-wrap text-[13px] text-ink">{lead.description}</p>
              </div>
            )}

            <JsonBlock label="Attribution" value={lead.attribution} />
            <JsonBlock label="Engagement" value={lead.engagement} />
            <JsonBlock label="Geo" value={lead.geo} />
          </div>

          <div className="border-b border-line p-5">
            <h3 className="mb-2 text-sm font-semibold text-ink">Pipeline Simulator</h3>
            {lead.pipeline_account_id ? (
              <p className="text-[12px] text-ink-soft">
                Tracked as a pipeline account.{" "}
                <Link href="/tools/pipeline" className="text-coir-dark hover:underline">
                  Open the simulator →
                </Link>
              </p>
            ) : (
              <div>
                <p className="mb-2 text-[12px] text-ink-soft">
                  Promote this lead into a pipeline account so it feeds the CAC / LTV math.
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

          <div className="p-5">
            <h3 className="mb-3 text-sm font-semibold text-ink">Activity</h3>
            {!activitiesLoaded && <p className="text-[12px] text-ink-soft">Loading…</p>}
            {activitiesLoaded && activities.length === 0 && (
              <p className="mb-3 text-[12px] text-ink-soft">Nothing logged yet.</p>
            )}
            <ul className="mb-3 space-y-3">
              {activities.map((a) => (
                <li key={a.id}>
                  <p className="font-mono text-[10px] text-ink-soft">
                    {a.author_email} · {new Date(a.created_at).toLocaleString("en-PH")}
                    {a.kind !== "note" && ` · ${a.kind.replace("_", " ")}`}
                  </p>
                  <p className="whitespace-pre-wrap text-[13px] text-ink">{a.body}</p>
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
                <Button intent="primary" size="sm" type="submit" disabled={!note.trim()}>
                  Post
                </Button>
              </form>
            )}
          </div>
        </DialogPopup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
