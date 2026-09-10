"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";
import { Download, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { canEditLead, type Role } from "@/lib/permissions";
import { computeNewPosition, sortByPosition } from "@/lib/tasks";
import {
  LEAD_STATUSES,
  ORIGIN_FORMS,
  ORIGIN_FORM_LABELS,
  leadsToCsv,
  productLabel,
  type CrmLeadRow,
  type LeadStatus,
  type OriginForm,
} from "@/lib/crm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TabBar, TabPanel } from "@/components/ui/tab-bar";
import { LeadPanel } from "./LeadPanel";
import { NewLeadForm } from "./NewLeadForm";

type Columns = Record<LeadStatus, string[]>;

const STATUS_ACCENT: Record<LeadStatus, string> = {
  New: "text-coir-dark border-coir/50",
  Acknowledged: "text-coir-dark border-coir/50",
  Qualified: "text-clay border-clay/50",
  "Pilot Scoping": "text-amber border-amber/50",
  "Closed Won": "text-coir-dark border-coir",
  "Closed Lost": "text-danger border-danger/50",
};

function buildColumns(leads: CrmLeadRow[]): Columns {
  const cols: Columns = {
    New: [],
    Acknowledged: [],
    Qualified: [],
    "Pilot Scoping": [],
    "Closed Won": [],
    "Closed Lost": [],
  };
  for (const lead of sortByPosition(leads)) cols[lead.status].push(lead.id);
  return cols;
}

function leadSearchText(lead: CrmLeadRow): string {
  return [
    lead.crm_contacts?.full_name,
    lead.crm_contacts?.email,
    lead.crm_contacts?.job_title,
    lead.crm_accounts?.name,
    lead.description,
    lead.product_of_interest,
    lead.source,
    ...(lead.product_interests ?? []).map(productLabel),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function LeadCard({
  lead,
  draggable,
  onOpen,
}: {
  lead: CrmLeadRow;
  draggable: boolean;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lead.id,
    disabled: !draggable,
  });

  const accountName = lead.crm_accounts?.name || lead.crm_contacts?.full_name || "Unnamed lead";
  const contactName = lead.crm_contacts?.full_name || lead.crm_contacts?.email;
  const ariaLabel = contactName
    ? `${accountName} — ${contactName}. Lead status: ${lead.status}.`
    : `${accountName}. Lead status: ${lead.status}.`;

  return (
    <button
      type="button"
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !attributes?.role) {
          e.preventDefault();
          onOpen();
        }
      }}
      aria-label={ariaLabel}
      className={`w-full rounded-lg border border-line bg-white p-3 shadow-card text-left transition-colors [@media(hover:hover)]:hover:border-coir/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-coir/30 bg-none ${
        isDragging ? "opacity-40" : ""
      } ${draggable ? "cursor-pointer" : "cursor-default"}`}
    >
      <p className="text-[13px] font-medium leading-snug text-ink group-hover:underline">
        {accountName}
      </p>
      {lead.crm_contacts && (
        <p className="mt-0.5 truncate font-mono text-[10px] text-ink-soft">
          {contactName}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="rounded-full border border-line px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-ink-soft">
          {ORIGIN_FORM_LABELS[lead.origin_form]}
        </span>
        {lead.engagement_tier && (
          <span className="rounded-full border border-clay/50 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-clay">
            {lead.engagement_tier.replace("_", " ")}
          </span>
        )}
      </div>
      {lead.product_interests.length > 0 && (
        <p className="mt-1.5 truncate font-mono text-[10px] text-ink-soft">
          {lead.product_interests.join(" · ")}
        </p>
      )}
    </button>
  );
}

function Column({
  status,
  leadIds,
  leadsById,
  draggable,
  onOpenLead,
}: {
  status: LeadStatus;
  leadIds: string[];
  leadsById: Record<string, CrmLeadRow>;
  draggable: boolean;
  onOpenLead: (lead: CrmLeadRow) => void;
}) {
  const { setNodeRef } = useDroppable({ id: status });

  return (
    <div className="flex min-h-[180px] flex-col rounded-xl border border-line bg-paper p-3">
      <div className="mb-2.5 flex items-center justify-between px-1">
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-soft">{status}</p>
        <span className="font-mono text-[10px] text-ink-soft">{leadIds.length}</span>
      </div>
      <SortableContext items={leadIds} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="flex-1 space-y-2">
          {leadIds.map((id) => {
            const lead = leadsById[id];
            if (!lead) return null;
            return (
              <LeadCard
                key={id}
                lead={lead}
                draggable={draggable}
                onOpen={() => onOpenLead(lead)}
              />
            );
          })}
          {leadIds.length === 0 && (
            <p className="px-1 py-2 text-[11px] text-ink-soft">Nothing here.</p>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

export function CrmBoard({
  initialLeads,
  role,
}: {
  initialLeads: CrmLeadRow[];
  role: Role | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const editable = canEditLead(role);

  const [leadsById, setLeadsById] = useState<Record<string, CrmLeadRow>>(() =>
    Object.fromEntries(initialLeads.map((l) => [l.id, l]))
  );
  const [columns, setColumns] = useState<Columns>(() => buildColumns(initialLeads));
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const [openLead, setOpenLead] = useState<CrmLeadRow | null>(null);
  const [tab, setTab] = useState<"funnel" | "list">("funnel");
  const [search, setSearch] = useState("");
  const [formFilter, setFormFilter] = useState<"all" | OriginForm>("all");
  const [tierFilter, setTierFilter] = useState("all");
  const dragSnapshot = useRef<{ columns: Columns; leadsById: Record<string, CrmLeadRow> } | null>(
    null
  );

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const allLeads = useMemo(() => Object.values(leadsById), [leadsById]);

  const tierOptions = useMemo(() => {
    const set = new Set(allLeads.map((l) => l.engagement_tier).filter((t) => t !== ""));
    return Array.from(set).sort();
  }, [allLeads]);

  const matchesFilters = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (lead: CrmLeadRow) => {
      if (formFilter !== "all" && lead.origin_form !== formFilter) return false;
      if (tierFilter !== "all" && lead.engagement_tier !== tierFilter) return false;
      if (q !== "" && !leadSearchText(lead).includes(q)) return false;
      return true;
    };
  }, [search, formFilter, tierFilter]);

  const filteredLeads = useMemo(
    () => sortByPosition(allLeads.filter(matchesFilters)),
    [allLeads, matchesFilters]
  );

  function findContainer(id: UniqueIdentifier): LeadStatus | null {
    if (LEAD_STATUSES.includes(id as LeadStatus)) return id as LeadStatus;
    for (const s of LEAD_STATUSES) if (columns[s].includes(id as string)) return s;
    return null;
  }

  function rollbackDrag() {
    const before = dragSnapshot.current;
    if (before) {
      setColumns(before.columns);
      setLeadsById(before.leadsById);
    }
    dragSnapshot.current = null;
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id);
    dragSnapshot.current = { columns, leadsById };
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const from = findContainer(active.id);
    const to = findContainer(over.id);
    if (!from || !to || from === to) return;

    setColumns((prev) => {
      const fromIds = prev[from].filter((id) => id !== active.id);
      const toIds = [...prev[to]];
      const overIdx = toIds.indexOf(over.id as string);
      const insertAt = overIdx >= 0 ? overIdx : toIds.length;
      toIds.splice(insertAt, 0, active.id as string);
      return { ...prev, [from]: fromIds, [to]: toIds };
    });
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) {
      rollbackDrag();
      return;
    }

    const container = findContainer(active.id);
    if (!container) return;

    let finalColumns = columns;
    const overContainer = findContainer(over.id);
    if (overContainer === container && active.id !== over.id) {
      const ids = columns[container];
      const oldIdx = ids.indexOf(active.id as string);
      const newIdx = ids.indexOf(over.id as string);
      if (oldIdx >= 0 && newIdx >= 0) {
        finalColumns = { ...columns, [container]: arrayMove(ids, oldIdx, newIdx) };
        setColumns(finalColumns);
      }
    }

    const ids = finalColumns[container];
    const idx = ids.indexOf(active.id as string);
    const prevLead = idx > 0 ? leadsById[ids[idx - 1]] : null;
    const nextLead = idx < ids.length - 1 ? leadsById[ids[idx + 1]] : null;
    const newPosition = computeNewPosition(
      prevLead ? prevLead.position : null,
      nextLead ? nextLead.position : null
    );

    const leadId = active.id as string;
    const before = dragSnapshot.current;
    const previousStatus = before?.leadsById[leadId]?.status ?? leadsById[leadId].status;
    setLeadsById((prev) => ({
      ...prev,
      [leadId]: { ...prev[leadId], status: container, position: newPosition },
    }));
    dragSnapshot.current = null;

    const { error, data } = await supabase
      .from("crm_leads")
      .update({ status: container, position: newPosition, updated_at: new Date().toISOString() })
      .eq("id", leadId)
      .select("id");

    if (error || !data || data.length === 0) {
      // An RLS rejection comes back as zero updated rows, not an error.
      if (before) {
        setColumns(before.columns);
        setLeadsById(before.leadsById);
      }
      toast.error(
        error ? "Could not move lead: " + error.message : "You don't have permission to move leads."
      );
      return;
    }

    if (previousStatus !== container) {
      await supabase.from("crm_lead_activities").insert({
        lead_id: leadId,
        kind: "status_change",
        body: `${previousStatus} → ${container}`,
        from_status: previousStatus,
        to_status: container,
      });
    }
  }

  function handleLeadUpdated(lead: CrmLeadRow) {
    setLeadsById((prev) => ({ ...prev, [lead.id]: lead }));
    setColumns((prev) => {
      let current: LeadStatus | null = null;
      for (const s of LEAD_STATUSES) if (prev[s].includes(lead.id)) current = s;
      if (!current || current === lead.status) return prev;
      return {
        ...prev,
        [current]: prev[current].filter((id) => id !== lead.id),
        [lead.status]: [...prev[lead.status], lead.id],
      };
    });
    setOpenLead(lead);
  }

  function handleLeadCreated(lead: CrmLeadRow) {
    setLeadsById((prev) => ({ ...prev, [lead.id]: lead }));
    setColumns((prev) => ({ ...prev, [lead.status]: [...prev[lead.status], lead.id] }));
  }

  function exportCsv() {
    if (filteredLeads.length === 0) {
      toast.error("Nothing to export with the current filters.");
      return;
    }
    const blob = new Blob([leadsToCsv(filteredLeads)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bughaw-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filteredLeads.length} lead${filteredLeads.length === 1 ? "" : "s"}.`);
  }

  const visibleColumns = useMemo(() => {
    const out: Columns = {
      New: [],
      Acknowledged: [],
      Qualified: [],
      "Pilot Scoping": [],
      "Closed Won": [],
      "Closed Lost": [],
    };
    for (const s of LEAD_STATUSES) {
      out[s] = columns[s].filter((id) => leadsById[id] && matchesFilters(leadsById[id]));
    }
    return out;
  }, [columns, leadsById, matchesFilters]);

  const activeLead = activeId ? leadsById[activeId as string] : null;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <TabBar
          idBase="crm-view"
          tabs={[
            { id: "funnel" as const, label: "Funnel" },
            { id: "list" as const, label: "All leads" },
          ]}
          value={tab}
          onChange={setTab}
        />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {editable && <NewLeadForm onCreated={handleLeadCreated} />}
          <Button intent="secondary" size="sm" onClick={exportCsv}>
            <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Export CSV
          </Button>
          <Button asChild size="sm">
            <Link href="/crm/import">
              <Upload className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Import
            </Link>
          </Button>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Input
          className="max-w-xs"
          placeholder="Search name, company, message…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search leads"
        />
        <Select
          className="max-w-[10rem]"
          value={formFilter}
          onChange={(e) => setFormFilter(e.target.value as "all" | OriginForm)}
          aria-label="Filter by source form"
        >
          <option value="all">All forms</option>
          {ORIGIN_FORMS.map((f) => (
            <option key={f} value={f}>
              {ORIGIN_FORM_LABELS[f]}
            </option>
          ))}
        </Select>
        <Select
          className="max-w-[10rem]"
          value={tierFilter}
          onChange={(e) => setTierFilter(e.target.value)}
          aria-label="Filter by engagement tier"
        >
          <option value="all">All tiers</option>
          {tierOptions.map((t) => (
            <option key={t} value={t}>
              {t.replace("_", " ")}
            </option>
          ))}
        </Select>
        <span className="font-mono text-[10px] text-ink-soft">
          {filteredLeads.length} of {allLeads.length}
        </span>
      </div>

      {allLeads.length === 0 && (
        <div className="rounded-xl border border-dashed border-line p-10 text-center text-sm text-ink-soft">
          No leads yet. Submissions from the website land here once the ingest endpoint is wired
          up — or add one by hand.
        </div>
      )}

      <TabPanel idBase="crm-view" value="funnel" current={tab}>
        {allLeads.length > 0 && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={rollbackDrag}
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {LEAD_STATUSES.map((s) => (
                <Column
                  key={s}
                  status={s}
                  leadIds={visibleColumns[s]}
                  leadsById={leadsById}
                  draggable={editable}
                  onOpenLead={setOpenLead}
                />
              ))}
            </div>
            <DragOverlay dropAnimation={{ duration: 200, easing: "cubic-bezier(0.23, 1, 0.32, 1)" }}>
              {activeLead ? (
                <div className="rotate-2 rounded-lg border border-coir bg-white p-3 shadow-pop">
                  <p className="text-[13px] font-medium leading-snug text-ink">
                    {activeLead.crm_accounts?.name || activeLead.crm_contacts?.full_name || "Lead"}
                  </p>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </TabPanel>

      <TabPanel idBase="crm-view" value="list" current={tab}>
        {allLeads.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-line bg-white shadow-card">
            <table className="w-full min-w-[52rem] text-left text-[13px]" aria-label="All leads list">
              <thead>
                <tr className="border-b border-line">
                  {["Submitted", "Account", "Contact", "Form", "Status", "Interests"].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-soft"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredLeads.map((lead) => {
                  const accountLabel = lead.crm_accounts?.name ?? "Unnamed lead";
                  const contactLabel =
                    lead.crm_contacts?.full_name || lead.crm_contacts?.email || "No contact";
                  const rowLabel = `${accountLabel}, ${contactLabel}. Status: ${lead.status}. Open lead details.`;
                  return (
                    <tr
                      key={lead.id}
                      tabIndex={0}
                      role="button"
                      aria-label={rowLabel}
                      onClick={() => setOpenLead(lead)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setOpenLead(lead);
                        }
                      }}
                      className="cursor-pointer border-b border-line/60 last:border-0 hover:bg-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-coir/30 focus-visible:bg-paper"
                    >
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] text-ink-soft">
                        {new Date(lead.submitted_at).toLocaleDateString("en-PH")}
                      </td>
                      <td className="px-3 py-2 text-ink">{lead.crm_accounts?.name ?? "—"}</td>
                      <td className="px-3 py-2 text-ink-soft">
                        {lead.crm_contacts?.full_name || lead.crm_contacts?.email || "—"}
                      </td>
                      <td className="px-3 py-2 text-ink-soft">
                        {ORIGIN_FORM_LABELS[lead.origin_form]}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide ${
                            STATUS_ACCENT[lead.status]
                          }`}
                        >
                          {lead.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-ink-soft">
                        {lead.product_interests.length > 0
                          ? lead.product_interests.map(productLabel).join(", ")
                          : lead.product_of_interest || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </TabPanel>

      {openLead && (
        <LeadPanel
          lead={openLead}
          role={role}
          onClose={() => setOpenLead(null)}
          onUpdated={handleLeadUpdated}
        />
      )}
    </div>
  );
}
