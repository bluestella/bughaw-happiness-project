"use client";

import { useMemo, useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PublicCardView } from "@/components/cards/PublicCardView";
import { useTeamDirectory } from "@/lib/useTeamDirectory";
import {
  BIO_MAX,
  BLURB_MAX,
  CARD_STATUSES,
  CTA_LABEL_MAX,
  STATUS_LABEL,
  emptyCardDraft,
  normalizeCard,
  toPublicCard,
  validateCard,
  type BusinessCard,
  type CardDraft,
  type CardErrors,
  type CardStatus,
} from "@/lib/cards";
import { ShareKit } from "./ShareKit";

function draftFrom(card: BusinessCard | null): CardDraft {
  if (!card) return emptyCardDraft();
  const { id: _id, token: _t, created_by_email: _c, created_at: _ca, updated_at: _u, ...draft } = card;
  return draft;
}

function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[11px] font-semibold text-ink-soft">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-[11.5px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-[11.5px] text-ink-soft">{hint}</p>
      ) : null}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3 rounded-xl border border-line bg-white p-4 shadow-card">
      <legend className="px-1 font-mono text-[10.5px] uppercase tracking-[0.1em] text-coir-dark">{title}</legend>
      {children}
    </fieldset>
  );
}

export function CardEditor({
  card,
  wallet,
  onSaved,
  onDeleted,
}: {
  card: BusinessCard | null;
  wallet: { apple: boolean; google: boolean };
  onSaved: (card: BusinessCard) => void;
  onDeleted: (id: string) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const { directory } = useTeamDirectory();
  const [draft, setDraft] = useState<CardDraft>(() => draftFrom(card));
  const [errors, setErrors] = useState<CardErrors>({});
  const [saving, setSaving] = useState(false);

  const dirty = JSON.stringify(draft) !== JSON.stringify(draftFrom(card));

  function set<K extends keyof CardDraft>(key: K, value: CardDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function text(key: keyof CardDraft) {
    return {
      id: `card-${key}`,
      value: draft[key] as string,
      "aria-invalid": errors[key] ? true : undefined,
      "aria-describedby": errors[key] ? `card-${key}-error` : undefined,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        set(key, e.target.value as never),
    };
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const next = normalizeCard(draft);
    const found = validateCard(next);
    setErrors(found);
    if (Object.values(found).some(Boolean)) {
      toast.error("Fix the highlighted fields first.");
      return;
    }
    setSaving(true);
    const query = card
      ? supabase.from("business_cards").update(next).eq("id", card.id).select().single()
      : supabase.from("business_cards").insert(next).select().single();
    const { data, error } = await query;
    setSaving(false);
    if (error || !data) {
      toast.error(error?.message ?? "Could not save the card.");
      return;
    }
    setDraft(draftFrom(data as BusinessCard));
    onSaved(data as BusinessCard);
    toast.success(card ? "Card saved." : "Card created as a draft.");
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_440px]">
      <div className="min-w-0 space-y-4">
        <form onSubmit={save} className="space-y-4" noValidate>
          <Group title="Person">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="card-full_name" label="Full name *" error={errors.full_name}>
                <Input {...text("full_name")} required autoComplete="off" />
              </Field>
              <Field id="card-job_title" label="Job title" error={errors.job_title}>
                <Input {...text("job_title")} placeholder="e.g. Partnerships Lead" />
              </Field>
            </div>
            <Field
              id="card-bio"
              label="Short bio"
              error={errors.bio}
              hint={`${draft.bio.length}/${BIO_MAX} characters`}
            >
              <Textarea {...text("bio")} rows={2} maxLength={BIO_MAX} />
            </Field>
            <Field
              id="card-photo_url"
              label="Photo URL"
              error={errors.photo_url}
              hint="A full https:// link to a square photo. It loads from that host on every view."
            >
              <Input {...text("photo_url")} type="url" placeholder="https://…" />
            </Field>
            <Field
              id="card-owner_email"
              label="Teammate (optional)"
              hint="Who this card belongs to. For your reference only — never shown publicly."
            >
              <Select
                id="card-owner_email"
                value={draft.owner_email}
                onChange={(e) => set("owner_email", e.target.value)}
              >
                <option value="">— Not linked —</option>
                {draft.owner_email && !directory.some((d) => d.email === draft.owner_email) && (
                  <option value={draft.owner_email}>{draft.owner_email}</option>
                )}
                {directory.map((d) => (
                  <option key={d.email} value={d.email}>
                    {d.email}
                    {d.note ? ` — ${d.note}` : ""}
                  </option>
                ))}
              </Select>
            </Field>
          </Group>

          <Group title="Contact">
            <Field id="card-email" label="Work email" error={errors.email}>
              <Input {...text("email")} type="email" placeholder="name@bughawinnovations.ph" />
            </Field>
            <Field
              id="card-phone"
              label="Mobile number"
              error={errors.phone}
              hint="Stays private unless “Show on card” is ticked."
            >
              <Input {...text("phone")} type="tel" placeholder="+63 917 000 0000" />
            </Field>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-ink">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-coir"
                  checked={draft.show_phone}
                  onChange={(e) => set("show_phone", e.target.checked)}
                />
                Show on card
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-coir"
                  checked={draft.phone_on_viber}
                  disabled={!draft.show_phone}
                  onChange={(e) => set("phone_on_viber", e.target.checked)}
                />
                Reachable on Viber
              </label>
            </div>
          </Group>

          <Group title="Links">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="card-linkedin_url" label="LinkedIn" error={errors.linkedin_url}>
                <Input {...text("linkedin_url")} type="url" placeholder="https://www.linkedin.com/in/…" />
              </Field>
              <Field id="card-facebook_url" label="Facebook" error={errors.facebook_url}>
                <Input {...text("facebook_url")} type="url" placeholder="https://www.facebook.com/…" />
              </Field>
              <Field id="card-instagram_url" label="Instagram" error={errors.instagram_url}>
                <Input {...text("instagram_url")} type="url" placeholder="https://www.instagram.com/…" />
              </Field>
              <Field id="card-website_url" label="Website" error={errors.website_url}>
                <Input {...text("website_url")} type="url" />
              </Field>
            </div>
          </Group>

          <Group title="Company">
            <Field
              id="card-company_blurb"
              label="About Bughaw"
              error={errors.company_blurb}
              hint={`${draft.company_blurb.length}/${BLURB_MAX} characters. Plain facts only — no certifications or partnerships without a signed document.`}
            >
              <Textarea {...text("company_blurb")} rows={3} maxLength={BLURB_MAX} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="card-cta_label" label="Button label" error={errors.cta_label}>
                <Input {...text("cta_label")} maxLength={CTA_LABEL_MAX} />
              </Field>
              <Field id="card-cta_url" label="Button link" error={errors.cta_url}>
                <Input {...text("cta_url")} type="url" />
              </Field>
            </div>
          </Group>

          <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-line bg-white p-4 shadow-card">
            <div className="min-w-[180px]">
              <label htmlFor="card-status" className="mb-1 block text-[11px] font-semibold text-ink-soft">
                Visibility
              </label>
              <Select
                id="card-status"
                value={draft.status}
                onChange={(e) => set("status", e.target.value as CardStatus)}
              >
                {CARD_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                    {s === "published" ? " — public via link" : s === "draft" ? " — private" : " — link disabled"}
                  </option>
                ))}
              </Select>
            </div>
            <Button intent="primary" type="submit" disabled={saving || (!!card && !dirty)}>
              <Save className="mr-1.5 h-4 w-4" aria-hidden />
              {saving ? "Saving…" : card ? "Save changes" : "Create card"}
            </Button>
          </div>
        </form>

        {card && (
          <ShareKit
            card={card}
            dirty={dirty}
            onTokenRotated={(token) => onSaved({ ...card, token })}
            onDeleted={() => onDeleted(card.id)}
          />
        )}
      </div>

      <div className="xl:sticky xl:top-16 xl:self-start">
        <p className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-soft">
          Live preview {dirty && "· unsaved"}
        </p>
        <div className="overflow-hidden rounded-xl border border-line">
          <PublicCardView card={toPublicCard(draft, card?.token)} preview wallet={wallet} />
        </div>
      </div>
    </div>
  );
}
