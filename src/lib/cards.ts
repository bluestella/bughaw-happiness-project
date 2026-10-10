// Digital business cards — pure vocabulary, validation, vCard / email-signature
// builders, request parsing and the analytics rollup. No I/O here, so every
// function is unit-tested in tests/unit/cards.test.ts.
//
// The vocabularies below MIRROR the check constraints and record_card_event()
// in supabase/migrations/0009_digital_cards.sql — change the SQL first.

import { DEFAULT_QR_STYLE, normalizeQrStyle, type QrStyle } from "@/lib/qrStyle";

export const COMPANY_NAME = "Bughaw Innovations";
export const COMPANY_WEBSITE = "https://bughawinnovations.ph";

export const BIO_MAX = 150;
export const BLURB_MAX = 400;
export const CTA_LABEL_MAX = 40;

export const DEFAULT_COMPANY_BLURB =
  "Bughaw Innovations makes hotel amenity items from coconut coir and cassava starch, starting with guest slippers. We buy the husk from coconut farming households in the Philippines.";
export const DEFAULT_CTA_LABEL = "Register for a hotel pilot";
export const DEFAULT_CTA_URL = "https://bughawinnovations.ph/for-hotels";

export const CARD_STATUSES = ["draft", "published", "suspended"] as const;
export type CardStatus = (typeof CARD_STATUSES)[number];

export const CARD_EVENTS = ["view", "save_contact", "click", "wallet_apple", "wallet_google"] as const;
export type CardEvent = (typeof CARD_EVENTS)[number];

export const CLICK_TARGETS = [
  "email",
  "phone",
  "viber",
  "linkedin",
  "facebook",
  "instagram",
  "website",
  "cta",
] as const;
export type ClickTarget = (typeof CLICK_TARGETS)[number];

export const CARD_SOURCES = ["link", "qr", "nfc", "email"] as const;
export type CardSource = (typeof CARD_SOURCES)[number];

export const DEVICES = ["mobile", "tablet", "desktop", "unknown"] as const;
export type Device = (typeof DEVICES)[number];

export const SOURCE_LABEL: Record<CardSource, string> = {
  link: "Direct link",
  qr: "QR code",
  nfc: "NFC tap",
  email: "Email signature",
};

export const TARGET_LABEL: Record<ClickTarget, string> = {
  email: "Email",
  phone: "Call",
  viber: "Viber",
  linkedin: "LinkedIn",
  facebook: "Facebook",
  instagram: "Instagram",
  website: "Website",
  cta: "Call to action",
};

export const STATUS_LABEL: Record<CardStatus, string> = {
  draft: "Draft",
  published: "Published",
  suspended: "Suspended",
};

/** Full admin row (public.business_cards). */
export type BusinessCard = {
  id: string;
  token: string;
  status: CardStatus;
  owner_email: string;
  full_name: string;
  job_title: string;
  bio: string;
  photo_url: string;
  email: string;
  phone: string;
  show_phone: boolean;
  phone_on_viber: boolean;
  linkedin_url: string;
  facebook_url: string;
  instagram_url: string;
  website_url: string;
  company_blurb: string;
  cta_label: string;
  cta_url: string;
  qr_style: QrStyle;
  created_by_email: string;
  created_at: string;
  updated_at: string;
};

/** What get_public_card() returns — the only shape a public visitor ever sees. */
export type PublicCard = {
  token: string;
  full_name: string;
  job_title: string;
  bio: string;
  photo_url: string;
  email: string;
  phone: string;
  phone_on_viber: boolean;
  linkedin_url: string;
  facebook_url: string;
  instagram_url: string;
  website_url: string;
  company_blurb: string;
  cta_label: string;
  cta_url: string;
  /** Display style only (migration 0010). */
  qr_style: QrStyle;
};

export type CardDraft = Omit<
  BusinessCard,
  "id" | "token" | "created_by_email" | "created_at" | "updated_at"
>;

export function emptyCardDraft(): CardDraft {
  return {
    status: "draft",
    owner_email: "",
    full_name: "",
    job_title: "",
    bio: "",
    photo_url: "",
    email: "",
    phone: "",
    show_phone: false,
    phone_on_viber: false,
    linkedin_url: "",
    facebook_url: "",
    instagram_url: "",
    website_url: COMPANY_WEBSITE,
    company_blurb: DEFAULT_COMPANY_BLURB,
    cta_label: DEFAULT_CTA_LABEL,
    cta_url: DEFAULT_CTA_URL,
    qr_style: { ...DEFAULT_QR_STYLE },
  };
}

/** Admin draft → the subset get_public_card() would expose (used for preview). */
export function toPublicCard(draft: CardDraft, token = "preview00000"): PublicCard {
  return {
    token,
    full_name: draft.full_name,
    job_title: draft.job_title,
    bio: draft.bio,
    photo_url: draft.photo_url,
    email: draft.email,
    phone: draft.show_phone ? draft.phone : "",
    phone_on_viber: draft.show_phone && draft.phone_on_viber,
    linkedin_url: draft.linkedin_url,
    facebook_url: draft.facebook_url,
    instagram_url: draft.instagram_url,
    website_url: draft.website_url,
    company_blurb: draft.company_blurb,
    cta_label: draft.cta_label,
    cta_url: draft.cta_url,
    qr_style: normalizeQrStyle(draft.qr_style),
  };
}

// ---------------------------------------------------------------------------
// Validation (mirrors the table check constraints)
// ---------------------------------------------------------------------------

const TOKEN_RE = /^[A-Za-z0-9]{12}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+() -]{0,30}$/;

export function isValidCardToken(token: unknown): token is string {
  return typeof token === "string" && TOKEN_RE.test(token);
}

export function isHttpsUrl(value: string): boolean {
  if (!value.startsWith("https://") || value.length > 500) return false;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && u.hostname.includes(".");
  } catch {
    return false;
  }
}

const URL_FIELDS = [
  ["photo_url", "Photo URL"],
  ["linkedin_url", "LinkedIn"],
  ["facebook_url", "Facebook"],
  ["instagram_url", "Instagram"],
  ["website_url", "Website"],
  ["cta_url", "Button link"],
] as const;

export type CardErrors = Partial<Record<keyof CardDraft, string>>;

export function validateCard(draft: CardDraft): CardErrors {
  const errors: CardErrors = {};
  const name = draft.full_name.trim();
  if (!name) errors.full_name = "Name is required.";
  else if (name.length > 120) errors.full_name = "Keep the name under 120 characters.";
  if (draft.job_title.length > 120) errors.job_title = "Keep the title under 120 characters.";
  if (draft.bio.length > BIO_MAX) errors.bio = `Bio is limited to ${BIO_MAX} characters.`;
  if (draft.email && !EMAIL_RE.test(draft.email)) errors.email = "Enter a valid email address.";
  if (draft.email.length > 254) errors.email = "Email is too long.";
  if (!PHONE_RE.test(draft.phone)) {
    errors.phone = "Use digits, spaces, +, ( ) or - only.";
  }
  if (draft.show_phone && !draft.phone.trim()) {
    errors.phone = "Add a number or turn off “Show on card”.";
  }
  for (const [key, label] of URL_FIELDS) {
    const v = draft[key];
    if (v && !isHttpsUrl(v)) errors[key] = `${label} must be a full https:// link.`;
  }
  if (draft.company_blurb.length > BLURB_MAX) {
    errors.company_blurb = `Company blurb is limited to ${BLURB_MAX} characters.`;
  }
  if (draft.cta_label.length > CTA_LABEL_MAX) {
    errors.cta_label = `Button label is limited to ${CTA_LABEL_MAX} characters.`;
  }
  if (Boolean(draft.cta_label.trim()) !== Boolean(draft.cta_url)) {
    errors.cta_url = "Fill in both the button label and its link, or neither.";
  }
  if (!(CARD_STATUSES as readonly string[]).includes(draft.status)) {
    errors.status = "Unknown status.";
  }
  return errors;
}

/** Normalizes a draft before it is written (trim, lower-case emails). */
export function normalizeCard(draft: CardDraft): CardDraft {
  return {
    ...draft,
    owner_email: draft.owner_email.trim().toLowerCase(),
    full_name: draft.full_name.trim(),
    job_title: draft.job_title.trim(),
    bio: draft.bio.trim(),
    photo_url: draft.photo_url.trim(),
    email: draft.email.trim().toLowerCase(),
    phone: draft.phone.trim(),
    phone_on_viber: draft.phone_on_viber && draft.show_phone,
    linkedin_url: draft.linkedin_url.trim(),
    facebook_url: draft.facebook_url.trim(),
    instagram_url: draft.instagram_url.trim(),
    website_url: draft.website_url.trim(),
    company_blurb: draft.company_blurb.trim(),
    cta_label: draft.cta_label.trim(),
    cta_url: draft.cta_url.trim(),
    qr_style: normalizeQrStyle(draft.qr_style),
  };
}

// ---------------------------------------------------------------------------
// URLs & request parsing
// ---------------------------------------------------------------------------

export function cardPath(token: string): string {
  return `/c/${token}`;
}

/** Absolute share URL. `source` is appended so analytics can attribute views. */
export function cardUrl(baseUrl: string, token: string, source?: CardSource): string {
  const base = baseUrl.replace(/\/+$/, "");
  const url = `${base}${cardPath(token)}`;
  return source && source !== "link" ? `${url}?s=${source}` : url;
}

export function parseSource(value: string | null | undefined): CardSource {
  return (CARD_SOURCES as readonly string[]).includes(value ?? "")
    ? (value as CardSource)
    : "link";
}

export function parseClickTarget(value: unknown): ClickTarget | null {
  return typeof value === "string" && (CLICK_TARGETS as readonly string[]).includes(value)
    ? (value as ClickTarget)
    : null;
}

const BOT_RE =
  /bot\b|bot\/|crawl|spider|slurp|preview|facebookexternalhit|facebookcatalog|embedly|vkshare|skypeuripreview|quora link|headless|lighthouse|pingdom|uptime|curl\/|wget\/|python-requests|go-http-client|node-fetch|axios\//i;

/** Link unfurlers (Messenger, Viber, Slack…), crawlers and scripts — never counted. */
export function isBotUserAgent(ua: string | null | undefined): boolean {
  if (!ua) return true;
  return BOT_RE.test(ua);
}

export function deviceFromUserAgent(ua: string | null | undefined): Device {
  if (!ua) return "unknown";
  if (/ipad|tablet|kindle|silk|playbook|(android(?!.*mobile))/i.test(ua)) return "tablet";
  if (/mobi|iphone|ipod|android.*mobile|windows phone|blackberry|opera mini/i.test(ua)) {
    return "mobile";
  }
  if (/windows nt|macintosh|x11|linux|cros/i.test(ua)) return "desktop";
  return "unknown";
}

/** tel: / viber: need digits and a leading + only. */
export function dialableNumber(phone: string): string {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/[^0-9]/g, "");
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

export function viberLink(phone: string): string {
  return `viber://chat?number=${encodeURIComponent(dialableNumber(phone))}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "B";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

// ---------------------------------------------------------------------------
// vCard 3.0 (RFC 2426) — the "Save contact" download
// ---------------------------------------------------------------------------

function vEscape(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

/** RFC 2425 §5.8.1 line folding at 75 octets (approximated by characters). */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  for (let i = 0; i < line.length; i += 74) chunks.push(line.slice(i, i + 74));
  return chunks.join("\r\n ");
}

export function buildVCard(card: PublicCard, url: string): string {
  const name = card.full_name.trim();
  const parts = name.split(/\s+/);
  const family = parts.length > 1 ? parts[parts.length - 1] : "";
  const given = parts.length > 1 ? parts.slice(0, -1).join(" ") : name;

  const lines: string[] = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${vEscape(family)};${vEscape(given)};;;`,
    `FN:${vEscape(name)}`,
    `ORG:${vEscape(COMPANY_NAME)}`,
  ];
  if (card.job_title) lines.push(`TITLE:${vEscape(card.job_title)}`);
  if (card.email) lines.push(`EMAIL;TYPE=INTERNET,WORK:${vEscape(card.email)}`);
  if (card.phone) lines.push(`TEL;TYPE=CELL:${vEscape(dialableNumber(card.phone))}`);
  if (card.website_url) lines.push(`URL;TYPE=WORK:${vEscape(card.website_url)}`);
  lines.push(`URL:${vEscape(url)}`);
  if (card.linkedin_url) lines.push(`X-SOCIALPROFILE;TYPE=linkedin:${vEscape(card.linkedin_url)}`);
  if (card.facebook_url) lines.push(`X-SOCIALPROFILE;TYPE=facebook:${vEscape(card.facebook_url)}`);
  if (card.instagram_url) lines.push(`X-SOCIALPROFILE;TYPE=instagram:${vEscape(card.instagram_url)}`);
  if (card.photo_url) lines.push(`PHOTO;VALUE=URI:${vEscape(card.photo_url)}`);
  if (card.bio) lines.push(`NOTE:${vEscape(card.bio)}`);
  lines.push("END:VCARD");
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** Safe ASCII file name for Content-Disposition. */
export function vcardFileName(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "contact"}.vcf`;
}

// ---------------------------------------------------------------------------
// Email signature — an HTML string the admin copies into Gmail / Outlook.
// Never rendered inside the app (no dangerouslySetInnerHTML); every value is
// escaped so a card field cannot inject markup into the recipient's mail.
// ---------------------------------------------------------------------------

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildEmailSignatureHtml(
  card: Pick<PublicCard, "full_name" | "job_title" | "email" | "phone">,
  opts: { cardUrl: string; logoUrl: string }
): string {
  const name = escapeHtml(card.full_name);
  const title = escapeHtml(card.job_title);
  const email = escapeHtml(card.email);
  const phone = escapeHtml(card.phone);
  const link = escapeHtml(opts.cardUrl);
  const logo = escapeHtml(opts.logoUrl);
  const contact = [
    email ? `<a href="mailto:${email}" style="color:#20699F;text-decoration:none;">${email}</a>` : "",
    phone ? `<span style="color:#6B6355;">${phone}</span>` : "",
  ]
    .filter(Boolean)
    .join(' <span style="color:#DDD6C0;">|</span> ');

  return [
    '<table cellpadding="0" cellspacing="0" border="0" style="font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:1.45;color:#241F1A;">',
    "<tr>",
    `<td style="padding-right:12px;vertical-align:top;"><img src="${logo}" width="48" height="48" alt="${escapeHtml(COMPANY_NAME)}" style="display:block;border:0;" /></td>`,
    '<td style="border-left:3px solid #E5B95F;padding-left:12px;vertical-align:top;">',
    `<div style="font-family:Georgia,serif;font-size:16px;font-weight:bold;color:#241F1A;">${name}</div>`,
    title ? `<div style="color:#6B6355;">${title} · ${escapeHtml(COMPANY_NAME)}</div>` : `<div style="color:#6B6355;">${escapeHtml(COMPANY_NAME)}</div>`,
    contact ? `<div>${contact}</div>` : "",
    `<div style="margin-top:4px;"><a href="${link}" style="color:#20699F;font-weight:bold;text-decoration:none;">View my digital card →</a></div>`,
    "</td>",
    "</tr>",
    "</table>",
  ]
    .filter(Boolean)
    .join("");
}

// ---------------------------------------------------------------------------
// Analytics — summarize admin_card_event_rollup() rows
// ---------------------------------------------------------------------------

export type RollupRow = {
  card_id: string;
  day: string; // YYYY-MM-DD, Asia/Manila
  event: CardEvent;
  target: ClickTarget | null;
  source: CardSource;
  device: Device;
  n: number;
};

export type CardStats = {
  views: number;
  saves: number;
  clicks: number;
  wallet: number;
  /** saves ÷ views; 0 when there are no views. */
  saveRate: number;
};

export type AnalyticsSummary = {
  totals: CardStats;
  days: string[];
  daily: { views: number[]; saves: number[] };
  bySource: Record<CardSource, number>;
  byDevice: Record<Device, number>;
  byTarget: Record<ClickTarget, number>;
  perCard: Record<string, CardStats>;
};

function emptyStats(): CardStats {
  return { views: 0, saves: 0, clicks: 0, wallet: 0, saveRate: 0 };
}

function zeroRecord<K extends string>(keys: readonly K[]): Record<K, number> {
  return Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
}

function withRate(s: CardStats): CardStats {
  return { ...s, saveRate: s.views > 0 ? s.saves / s.views : 0 };
}

/** Calendar days (YYYY-MM-DD) ending on `today`, oldest first. */
export function dayRange(today: string, count: number): string[] {
  const n = Math.max(1, Math.floor(Number.isFinite(count) ? count : 1));
  const [y, m, d] = today.split("-").map(Number);
  const end = Date.UTC(y, m - 1, d);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    out.push(new Date(end - i * 86_400_000).toISOString().slice(0, 10));
  }
  return out;
}

/** Today's date in Asia/Manila (UTC+8, no DST) as YYYY-MM-DD. */
export function manilaToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
}

export function summarizeCardEvents(
  rows: readonly RollupRow[],
  opts: { today: string; days: number; cardId?: string }
): AnalyticsSummary {
  const days = dayRange(opts.today, opts.days);
  const index = new Map(days.map((d, i) => [d, i]));
  const views = days.map(() => 0);
  const saves = days.map(() => 0);
  const bySource = zeroRecord(CARD_SOURCES);
  const byDevice = zeroRecord(DEVICES);
  const byTarget = zeroRecord(CLICK_TARGETS);
  const perCard: Record<string, CardStats> = {};
  let totals = emptyStats();

  for (const row of rows) {
    const i = index.get(row.day);
    if (i === undefined) continue;
    if (opts.cardId && row.card_id !== opts.cardId) continue;
    const n = Number.isFinite(row.n) && row.n > 0 ? row.n : 0;
    if (n === 0) continue;

    const card = (perCard[row.card_id] ??= emptyStats());
    switch (row.event) {
      case "view":
        views[i] += n;
        totals.views += n;
        card.views += n;
        if (row.source in bySource) bySource[row.source] += n;
        if (row.device in byDevice) byDevice[row.device] += n;
        break;
      case "save_contact":
        saves[i] += n;
        totals.saves += n;
        card.saves += n;
        break;
      case "click":
        totals.clicks += n;
        card.clicks += n;
        if (row.target && row.target in byTarget) byTarget[row.target] += n;
        break;
      case "wallet_apple":
      case "wallet_google":
        totals.wallet += n;
        card.wallet += n;
        break;
    }
  }

  totals = withRate(totals);
  for (const id of Object.keys(perCard)) perCard[id] = withRate(perCard[id]);

  return { totals, days, daily: { views, saves }, bySource, byDevice, byTarget, perCard };
}
