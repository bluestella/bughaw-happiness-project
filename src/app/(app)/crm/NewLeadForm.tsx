"use client";

import { useMemo, useState } from "react";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { DialogBackdrop, DialogPopup } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { createLeadFromSubmission } from "@/lib/crmClient";
import {
  PRODUCTS,
  ROOM_COUNT_BANDS,
  SOURCES,
  STAR_RATINGS,
  validateSubmission,
  type CrmLeadRow,
  type SubmissionBody,
  type SubmissionForm,
} from "@/lib/crm";
import { LEAD_ROW_SELECT } from "./leadSelect";

const FORM_LABELS: Record<SubmissionForm, string> = {
  contact: "General contact",
  for_hotels: "Hotel pilot",
  inquiry: "Product inquiry",
};

const EMPTY: Record<string, string> = {
  name: "",
  email: "",
  company: "",
  role: "",
  message: "",
  fullName: "",
  hotelName: "",
  starRating: "",
  roomCount: "",
  source: "",
  product: "",
  quantity: "",
  additionalInfo: "",
};

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
      <span className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">{label}</span>
      {children}
      {error && <span className="mt-0.5 block text-[11px] text-danger">{error}</span>}
    </label>
  );
}

export function NewLeadForm({ onCreated }: { onCreated: (lead: CrmLeadRow) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<SubmissionForm>("contact");
  const [values, setValues] = useState<Record<string, string>>(EMPTY);
  const [interests, setInterests] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  function set(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function reset() {
    setValues(EMPTY);
    setInterests([]);
    setErrors({});
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body: SubmissionBody = { ...values, interests };
    const result = validateSubmission(form, body);
    if (!result.ok) {
      setErrors(result.details);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const { leadId, contactExisted } = await createLeadFromSubmission(
        supabase,
        form,
        body,
        "manual"
      );
      const { data, error } = await supabase
        .from("crm_leads")
        .select(LEAD_ROW_SELECT)
        .eq("id", leadId)
        .single();
      if (error || !data) throw new Error(error?.message ?? "Could not read the new lead back.");
      onCreated(data as unknown as CrmLeadRow);
      toast.success(
        contactExisted ? "Lead added to the existing contact." : "Lead and contact created."
      );
      reset();
      setOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save the lead.";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button intent="primary" size="sm" onClick={() => setOpen(true)}>
        <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
        New lead
      </Button>

      <BaseDialog.Root open={open} onOpenChange={setOpen}>
        <BaseDialog.Portal>
          <DialogBackdrop />
          <DialogPopup unpadded className="max-h-[calc(100vh-4rem)] max-w-lg overflow-y-auto">
            <div className="border-b border-line p-5">
              <BaseDialog.Title className="text-base font-semibold text-ink">
                Add a lead
              </BaseDialog.Title>
              <BaseDialog.Description className="text-[11px] text-ink-soft">
                Same fields and rules as the website forms.
              </BaseDialog.Description>
            </div>

            <form onSubmit={submit} className="space-y-3 p-5">
              <Field label="Submission type">
                <Select
                  value={form}
                  onChange={(e) => {
                    setForm(e.target.value as SubmissionForm);
                    setErrors({});
                  }}
                >
                  {(Object.keys(FORM_LABELS) as SubmissionForm[]).map((f) => (
                    <option key={f} value={f}>
                      {FORM_LABELS[f]}
                    </option>
                  ))}
                </Select>
              </Field>

              {form === "contact" && (
                <>
                  <Field label="Full name *" error={errors.name}>
                    <Input value={values.name} onChange={(e) => set("name", e.target.value)} />
                  </Field>
                  <Field label="Email address *" error={errors.email}>
                    <Input
                      type="email"
                      value={values.email}
                      onChange={(e) => set("email", e.target.value)}
                    />
                  </Field>
                  <Field label="Company / organisation *" error={errors.company}>
                    <Input value={values.company} onChange={(e) => set("company", e.target.value)} />
                  </Field>
                  <Field label="Their role *" error={errors.role}>
                    <Input value={values.role} onChange={(e) => set("role", e.target.value)} />
                  </Field>
                  <Field label="Message *" error={errors.message}>
                    <Textarea
                      rows={4}
                      value={values.message}
                      onChange={(e) => set("message", e.target.value)}
                    />
                  </Field>
                </>
              )}

              {form === "for_hotels" && (
                <>
                  <Field label="Full name *" error={errors.fullName}>
                    <Input
                      value={values.fullName}
                      onChange={(e) => set("fullName", e.target.value)}
                    />
                  </Field>
                  <Field label="Email address *" error={errors.email}>
                    <Input
                      type="email"
                      value={values.email}
                      onChange={(e) => set("email", e.target.value)}
                    />
                  </Field>
                  <Field label="Hotel / property name *" error={errors.hotelName}>
                    <Input
                      value={values.hotelName}
                      onChange={(e) => set("hotelName", e.target.value)}
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="DOT star rating" error={errors.starRating}>
                      <Select
                        value={values.starRating}
                        onChange={(e) => set("starRating", e.target.value)}
                      >
                        <option value="">Select a rating</option>
                        {STAR_RATINGS.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Approximate room count" error={errors.roomCount}>
                      <Select
                        value={values.roomCount}
                        onChange={(e) => set("roomCount", e.target.value)}
                      >
                        <option value="">Select room count</option>
                        {ROOM_COUNT_BANDS.map((r) => (
                          <option key={r}>{r}</option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <fieldset>
                    <legend className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">
                      Which products interest them?
                    </legend>
                    <div className="mt-1.5 space-y-1.5">
                      {PRODUCTS.map((p) => (
                        <label key={p.id} className="flex items-center gap-2 text-[13px] text-ink">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 accent-coir"
                            checked={interests.includes(p.id)}
                            onChange={(e) =>
                              setInterests((prev) =>
                                e.target.checked
                                  ? [...prev, p.id]
                                  : prev.filter((x) => x !== p.id)
                              )
                            }
                          />
                          {p.name}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <Field label="How did they hear about us?" error={errors.source}>
                    <Select value={values.source} onChange={(e) => set("source", e.target.value)}>
                      <option value="">Select a source</option>
                      {SOURCES.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Message" error={errors.message}>
                    <Textarea
                      rows={3}
                      value={values.message}
                      onChange={(e) => set("message", e.target.value)}
                    />
                  </Field>
                </>
              )}

              {form === "inquiry" && (
                <>
                  <Field label="Company name *" error={errors.name}>
                    <Input value={values.name} onChange={(e) => set("name", e.target.value)} />
                  </Field>
                  <Field label="Email address *" error={errors.email}>
                    <Input
                      type="email"
                      value={values.email}
                      onChange={(e) => set("email", e.target.value)}
                    />
                  </Field>
                  <Field label="Product interest *" error={errors.product}>
                    <Input value={values.product} onChange={(e) => set("product", e.target.value)} />
                  </Field>
                  <Field label="Estimated volume *" error={errors.quantity}>
                    <Input
                      value={values.quantity}
                      onChange={(e) => set("quantity", e.target.value)}
                    />
                  </Field>
                  <Field label="Additional information" error={errors.additionalInfo}>
                    <Textarea
                      rows={3}
                      value={values.additionalInfo}
                      onChange={(e) => set("additionalInfo", e.target.value)}
                    />
                  </Field>
                </>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <Button intent="secondary" size="sm" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button intent="primary" size="sm" type="submit" disabled={saving}>
                  {saving ? "Saving…" : "Add lead"}
                </Button>
              </div>
            </form>
          </DialogPopup>
        </BaseDialog.Portal>
      </BaseDialog.Root>
    </>
  );
}
