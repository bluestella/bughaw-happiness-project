// CRM domain model + pure helpers.
//
// Every constant and validation rule here is transcribed from FORMS_AUDIT.md
// (the audit of the bughawinnovations.ph marketing-site forms). Keep them in
// sync with that document and with supabase/migrations/0003_crm.sql.

// ---------------------------------------------------------------------------
// Vocabulary (FORMS_AUDIT §3, §7, §10.3)
// ---------------------------------------------------------------------------

export const LEAD_STATUSES = [
  "New",
  "Acknowledged",
  "Qualified",
  "Pilot Scoping",
  "Closed Won",
  "Closed Lost",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const ORIGIN_FORMS = [
  "contact",
  "for_hotels",
  "inquiry_api",
  "manual",
  "import",
] as const;
export type OriginForm = (typeof ORIGIN_FORMS)[number];

export const LEAD_TYPES = ["general", "hotel_pilot", "inquiry"] as const;
export type LeadType = (typeof LEAD_TYPES)[number];

/** The three shapes a submission can arrive in (audit §2, §3, §4). */
export const SUBMISSION_FORMS = ["contact", "for_hotels", "inquiry"] as const;
export type SubmissionForm = (typeof SUBMISSION_FORMS)[number];

export const ORIGIN_FORM_LABELS: Record<OriginForm, string> = {
  contact: "Contact form",
  for_hotels: "Hotel pilot",
  inquiry_api: "Product inquiry",
  manual: "Manual entry",
  import: "Imported",
};

/** Audit §3.7 */
export const SOURCES = ["Referral", "LinkedIn", "Search", "Event", "Other"] as const;

/** Audit §3.4 */
export const STAR_RATINGS = ["3-Star", "4-Star", "5-Star", "Unrated"] as const;

/** Audit §3.5 */
export const ROOM_COUNT_BANDS = ["<50", "50–100", "101–200", "200+"] as const;

/** Audit §7 — engagement tier picklist. */
export const ENGAGEMENT_TIERS = ["tier_1", "tier_2", "tier_3", "tier_4"] as const;

/** Audit §3.6 — the five products the hotel form offers. */
export const PRODUCTS = [
  { id: "P1", name: "Biodegradable Razor", badge: "Guest amenity" },
  { id: "P2", name: "Coconut-Husk Slippers", badge: "Guest footwear" },
  { id: "P3", name: "Shampoo & Soap Bar Holder", badge: "Bar program accessory" },
  { id: "P4", name: "Back-of-House Essentials", badge: "Housekeeping & back-of-house" },
  { id: "P5", name: "Biodegradable Bin Liner", badge: "Room waste management" },
] as const;

export function productLabel(id: string): string {
  const p = PRODUCTS.find((x) => x.id === id);
  return p ? p.name : id;
}

// ---------------------------------------------------------------------------
// Row types (mirror supabase/migrations/0003_crm.sql)
// ---------------------------------------------------------------------------

export type CrmAccount = {
  id: string;
  name: string;
  kind: "hotel" | "company";
  industry: string;
  hotel_star_rating: string;
  hotel_room_count_band: string;
};

export type CrmContact = {
  id: string;
  account_id: string | null;
  full_name: string;
  email: string;
  job_title: string;
};

export type CrmLead = {
  id: string;
  contact_id: string | null;
  account_id: string | null;
  origin_form: OriginForm;
  lead_type: LeadType;
  status: LeadStatus;
  position: number;
  source: string;
  product_interests: string[];
  product_of_interest: string;
  estimated_volume: string;
  description: string;
  engagement_tier: string;
  ga_client_id: string | null;
  attribution: unknown;
  engagement: unknown;
  geo: unknown;
  raw: unknown;
  pipeline_account_id: string | null;
  submitted_at: string;
  created_at: string;
  updated_at: string;
};

/** A lead as the board reads it — joined with its contact and account. */
export type CrmLeadRow = CrmLead & {
  crm_contacts: Pick<CrmContact, "id" | "full_name" | "email" | "job_title"> | null;
  crm_accounts: Pick<CrmAccount, "id" | "name" | "kind" | "hotel_star_rating" | "hotel_room_count_band"> | null;
};

export type CrmActivity = {
  id: string;
  lead_id: string;
  kind: "note" | "status_change" | "system";
  body: string;
  from_status: string | null;
  to_status: string | null;
  author_email: string;
  created_at: string;
};

export type NormalizedSubmission = {
  account: {
    name: string;
    kind: "hotel" | "company";
    industry: string;
    hotel_star_rating: string;
    hotel_room_count_band: string;
  } | null;
  contact: { full_name: string; email: string; job_title: string };
  lead: {
    origin_form: OriginForm;
    lead_type: LeadType;
    source: string;
    product_interests: string[];
    product_of_interest: string;
    estimated_volume: string;
    description: string;
    engagement_tier: string;
    ga_client_id: string | null;
    attribution: unknown;
    engagement: unknown;
    geo: unknown;
  };
};

export type SubmissionBody = Record<string, unknown>;

export type ValidationResult =
  | { ok: true }
  | { ok: false; details: Record<string, string> };

// ---------------------------------------------------------------------------
// Dedupe keys (audit §10.2) + honeypot (audit §5.1)
// ---------------------------------------------------------------------------

export function accountKey(name: string | null | undefined): string {
  return (name ?? "").trim().toLowerCase();
}

export function emailKey(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

/**
 * Audit §5.1 — a non-empty `website_field_hp` means a bot. Never store the
 * record; the caller still gets a normal success response.
 */
export function isHoneypotHit(body: SubmissionBody): boolean {
  return str(body.website_field_hp).trim() !== "";
}

// ---------------------------------------------------------------------------
// Validation (audit §6.1–6.3, error shape §6.4)
// ---------------------------------------------------------------------------

/** Audit §2.2 — RFC 5322 simplified, the exact regex the marketing site uses. */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function trimmed(body: SubmissionBody, key: string): string {
  return str(body[key]).trim();
}

function checkText(
  details: Record<string, string>,
  body: SubmissionBody,
  key: string,
  label: string,
  opts: { required: boolean; min?: number; max: number }
): void {
  const value = trimmed(body, key);
  if (value === "") {
    if (opts.required) details[key] = `${label} is required.`;
    return;
  }
  if (opts.min !== undefined && value.length < opts.min) {
    details[key] = `${label} must be at least ${opts.min} characters.`;
    return;
  }
  if (value.length > opts.max) {
    details[key] = `${label} must be ${opts.max} characters or fewer.`;
  }
}

function checkEmail(details: Record<string, string>, body: SubmissionBody): void {
  const value = trimmed(body, "email");
  if (value === "") {
    details.email = "Email address is required.";
    return;
  }
  if (!EMAIL_RE.test(value)) details.email = "Enter a valid email address.";
}

export function validateSubmission(
  form: SubmissionForm,
  body: SubmissionBody
): ValidationResult {
  const details: Record<string, string> = {};

  if (form === "contact") {
    // Audit §6.1
    checkText(details, body, "name", "Full name", { required: true, min: 2, max: 100 });
    checkEmail(details, body);
    checkText(details, body, "company", "Company / organisation", { required: true, min: 2, max: 150 });
    checkText(details, body, "role", "Your role", { required: true, min: 2, max: 100 });
    checkText(details, body, "message", "Message", { required: true, min: 10, max: 5000 });
  } else if (form === "for_hotels") {
    // Audit §6.2
    checkText(details, body, "fullName", "Full name", { required: true, min: 2, max: 100 });
    checkEmail(details, body);
    checkText(details, body, "hotelName", "Hotel / property name", { required: true, min: 2, max: 150 });
    checkText(details, body, "starRating", "DOT star rating", { required: false, max: 50 });
    checkText(details, body, "roomCount", "Approximate room count", { required: false, max: 50 });
    checkText(details, body, "source", "How did you hear about us?", { required: false, max: 100 });
    checkText(details, body, "message", "Message", { required: false, max: 3000 });
  } else {
    // Audit §6.3
    checkText(details, body, "name", "Company Name", { required: true, min: 2, max: 100 });
    checkEmail(details, body);
    checkText(details, body, "product", "Product Interest", { required: true, min: 2, max: 100 });
    checkText(details, body, "quantity", "Estimated Volume", { required: true, min: 1, max: 50 });
    checkText(details, body, "additionalInfo", "Additional Information", { required: false, max: 2000 });
  }

  if (Object.keys(details).length > 0) return { ok: false, details };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Normalization: submission body → Account / Contact / Lead (audit §10.1)
// ---------------------------------------------------------------------------

/** Audit §3.6 — `interests[]` is normalized to clean, non-empty strings. */
export function normalizeInterests(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const s = str(item).trim();
    if (s !== "") out.push(s);
  }
  return out;
}

function nested(body: SubmissionBody, key: string): unknown {
  const v = body[key];
  return v === undefined ? null : v;
}

function nestedString(body: SubmissionBody, outer: string, inner: string): string {
  const o = body[outer];
  if (o && typeof o === "object" && !Array.isArray(o)) {
    return str((o as Record<string, unknown>)[inner]);
  }
  return "";
}

/**
 * `originForm` lets manual entry and CSV import reuse the same mapping while
 * still recording where the record actually came from.
 */
export function normalizeSubmission(
  form: SubmissionForm,
  body: SubmissionBody,
  originForm?: OriginForm
): NormalizedSubmission {
  const tier = nestedString(body, "_engagement", "tier");
  const gaClientId = nestedString(body, "_analytics", "gaClientId");

  const common = {
    engagement_tier: tier,
    ga_client_id: gaClientId === "" ? null : gaClientId,
    attribution: nested(body, "_attribution"),
    engagement: nested(body, "_engagement"),
    geo: nested(body, "_geo"),
  };

  if (form === "for_hotels") {
    const hotelName = trimmed(body, "hotelName");
    return {
      account:
        hotelName === ""
          ? null
          : {
              name: hotelName,
              kind: "hotel",
              industry: "Hospitality",
              hotel_star_rating: trimmed(body, "starRating"),
              hotel_room_count_band: trimmed(body, "roomCount"),
            },
      contact: {
        full_name: trimmed(body, "fullName"),
        email: trimmed(body, "email"),
        job_title: "",
      },
      lead: {
        origin_form: originForm ?? "for_hotels",
        lead_type: "hotel_pilot",
        source: trimmed(body, "source"),
        product_interests: normalizeInterests(body.interests),
        product_of_interest: "",
        estimated_volume: "",
        description: trimmed(body, "message"),
        ...common,
      },
    };
  }

  if (form === "inquiry") {
    const company = trimmed(body, "name");
    return {
      account:
        company === ""
          ? null
          : {
              name: company,
              kind: "company",
              industry: "",
              hotel_star_rating: "",
              hotel_room_count_band: "",
            },
      contact: {
        full_name: company,
        email: trimmed(body, "email"),
        job_title: "",
      },
      lead: {
        origin_form: originForm ?? "inquiry_api",
        lead_type: "inquiry",
        source: trimmed(body, "source"),
        product_interests: [],
        product_of_interest: trimmed(body, "product"),
        estimated_volume: trimmed(body, "quantity"),
        description: trimmed(body, "additionalInfo"),
        ...common,
      },
    };
  }

  const company = trimmed(body, "company");
  return {
    account:
      company === ""
        ? null
        : {
            name: company,
            kind: "company",
            industry: "",
            hotel_star_rating: "",
            hotel_room_count_band: "",
          },
    contact: {
      full_name: trimmed(body, "name"),
      email: trimmed(body, "email"),
      job_title: trimmed(body, "role"),
    },
    lead: {
      origin_form: originForm ?? "contact",
      lead_type: "general",
      source: trimmed(body, "source"),
      product_interests: [],
      product_of_interest: "",
      estimated_volume: "",
      description: trimmed(body, "message"),
      ...common,
    },
  };
}

export function isSubmissionForm(v: unknown): v is SubmissionForm {
  return (SUBMISSION_FORMS as readonly string[]).includes(str(v));
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

const CSV_COLUMNS = [
  "submitted_at",
  "status",
  "origin_form",
  "lead_type",
  "full_name",
  "email",
  "job_title",
  "account",
  "star_rating",
  "room_count",
  "source",
  "product_interests",
  "product_of_interest",
  "estimated_volume",
  "engagement_tier",
  "description",
] as const;

export function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function leadsToCsv(leads: CrmLeadRow[]): string {
  const lines = [CSV_COLUMNS.join(",")];
  for (const lead of leads) {
    lines.push(
      [
        lead.submitted_at,
        lead.status,
        lead.origin_form,
        lead.lead_type,
        lead.crm_contacts?.full_name ?? "",
        lead.crm_contacts?.email ?? "",
        lead.crm_contacts?.job_title ?? "",
        lead.crm_accounts?.name ?? "",
        lead.crm_accounts?.hotel_star_rating ?? "",
        lead.crm_accounts?.hotel_room_count_band ?? "",
        lead.source,
        (lead.product_interests ?? []).map(productLabel).join(" | "),
        lead.product_of_interest,
        lead.estimated_volume,
        lead.engagement_tier,
        lead.description,
      ]
        .map(csvEscape)
        .join(",")
    );
  }
  return lines.join("\r\n");
}

// ---------------------------------------------------------------------------
// CSV parsing (import screen) — RFC 4180 subset with quoted fields
// ---------------------------------------------------------------------------

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (ch === "\r") {
      i++;
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += ch;
    i++;
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** Turns a parsed CSV (first row = headers) into submission-body objects. */
export function csvToBodies(text: string): SubmissionBody[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim());
  const out: SubmissionBody[] = [];
  for (let r = 1; r < rows.length; r++) {
    const body: SubmissionBody = {};
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c];
      if (key === "") continue;
      const value = (rows[r][c] ?? "").trim();
      body[key] = key === "interests" ? value.split(/[|;]/).map((s) => s.trim()) : value;
    }
    out.push(body);
  }
  return out;
}
