# Bughaw Innovations — Complete Forms Audit

> For CRM application development. Generated from source code audit.
> Date: 2026-09-10

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Form #1 — General Contact Form (`/contact`)](#2-form--1--general-contact-form--contact-)
3. [Form #2 — Hotel Pilot Registration Form (`/for-hotels`)](#3-form--2--hotel-pilot-registration-form--for-hotels-)
4. [Form #3 — Product Inquiry API (No UI)](#4-form--3--product-inquiry-api--no-ui-)
5. [Common Field Behaviour & Anti-Spam](#5-common-field-behaviour---anti-spam)
6. [Server-Side Validation Summary](#6-server-side-validation-summary)
7. [Hidden Metadata Fields (Sent With Every Submission)](#7-hidden-metadata-fields--sent-with-every-submission-)
8. [API Endpoints & Rate Limiting](#8-api-endpoints---rate-limiting)
9. [Email Confirmation Matrix](#9-email-confirmation-matrix)
10. [CRM Entity Mapping Recommendations](#10-crm-entity-mapping-recommendations)

---

## 1. Architecture Overview

| Property | Value |
|---|---|
| **Reusable form component** | `ContactForm.tsx` (single component, config-driven) |
| **Form library** | None — custom React `useState` implementation |
| **Field rendering** | Dynamic via `FieldConfig[]` schema |
| **Supported field types** | `text`, `email`, `textarea`, `select`, `checkbox-group` |
| **Anti-spam** | Honeypot input: `website_field_hp` (always empty for humans) |
| **Client validation** | Required-only on blur/submit; full rules enforced server-side |
| **Error display** | Per-field inline (`aria-describedby`) + top banner (`role="alert"`) |
| **Accessibility** | `aria-invalid`, auto-focus first error, `aria-live` success/error regions |
| **Analytics** | GA4 events: `form_start`, `form_submit_attempt`, `form_submit_success`, `form_submit_error` |

**Key source files:**
- Form component: [ContactForm.tsx](file:///Users/bluestella/repositories/bughaw-innovations/components/ContactForm.tsx)
- Field schemas: [constants.ts](file:///Users/bluestella/repositories/bughaw-innovations/lib/constants.ts)
- Field types: [types.ts](file:///Users/bluestella/repositories/bughaw-innovations/lib/types.ts#L24-L41)
- Server handlers + validation: [formSubmissions.js](file:///Users/bluestella/repositories/bughaw-innovations/formSubmissions.js)
- Contact page: [app/contact/page.tsx](file:///Users/bluestella/repositories/bughaw-innovations/app/contact/page.tsx)
- For Hotels page: [app/for-hotels/page.tsx](file:///Users/bluestella/repositories/bughaw-innovations/app/for-hotels/page.tsx)

---

## 2. Form #1 — General Contact Form (`/contact`)

### Form Metadata

| Property | Value |
|---|---|
| **Form name (internal)** | `contact` |
| **Route** | `/contact` |
| **API endpoint** | `POST /api/contact` |
| **Submit button label** | `Send inquiry` |
| **Success message (inline)** | `Thank you. We'll reply within 2 business days.` |
| **Success message (server)** | `Your message is in. We'll respond within 3 business days.` |
| **Lead type (GA4)** | `general` |
| **Number of fields** | 5 (all required) |
| **Has groups?** | No (single-section layout) |

### Fields Detail

#### 2.1 `name` — Full name

| Attribute | Value |
|---|---|
| **HTML `id`** | `name` |
| **HTML `name`** | `name` |
| **Label** | `Full name *` |
| **Type** | `text` (`<input type="text">`) |
| **Required** | Yes |
| **Placeholder** | `Your name` |
| **Helper text** | `The person we should reply to.` |
| **`autoComplete`** | `name` |
| **Min length (server)** | 2 characters |
| **Max length (server)** | 100 characters |
| **Pattern/format** | Free text (trimmed server-side) |
| **CRM suggestion** | Contact → First Name + Last Name (split on first space) or Full Name single field |

#### 2.2 `email` — Email address

| Attribute | Value |
|---|---|
| **HTML `id`** | `email` |
| **HTML `name`** | `email` |
| **Label** | `Email address *` |
| **Type** | `email` (`<input type="email">`) |
| **Required** | Yes |
| **Placeholder** | `you@company.com` |
| **Helper text** | `A work email helps us route faster.` |
| **`autoComplete`** | `email` |
| **Min length (server)** | N/A (format-validated only) |
| **Max length (server)** | Implicit via regex (no explicit cap) |
| **Pattern/format** | RFC 5322 simplified: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` |
| **CRM suggestion** | Contact → Primary Email |

#### 2.3 `company` — Company / organisation

| Attribute | Value |
|---|---|
| **HTML `id`** | `company` |
| **HTML `name`** | `company` |
| **Label** | `Company / organisation *` |
| **Type** | `text` (`<input type="text">`) |
| **Required** | Yes |
| **Placeholder** | `Your company` |
| **Helper text** | `Hotel group, fund, newsroom, university, agency: any is fine.` |
| **`autoComplete`** | `off` |
| **Min length (server)** | 2 characters |
| **Max length (server)** | 150 characters |
| **Pattern/format** | Free text |
| **CRM suggestion** | Account → Account Name / Company |

#### 2.4 `role` — Your role

| Attribute | Value |
|---|---|
| **HTML `id`** | `role` |
| **HTML `name`** | `role` |
| **Label** | `Your role *` |
| **Type** | `text` (`<input type="text">`) |
| **Required** | Yes |
| **Placeholder** | `Procurement, ESG, GM, editor...` |
| **Helper text** | `Example: Procurement, ESG, GM, editor, program officer.` |
| **`autoComplete`** | `off` |
| **Min length (server)** | 2 characters |
| **Max length (server)** | 100 characters |
| **Pattern/format** | Free text |
| **CRM suggestion** | Contact → Job Title / Role |

#### 2.5 `message` — Message

| Attribute | Value |
|---|---|
| **HTML `id`** | `message` |
| **HTML `name`** | `message` |
| **Label** | `Message *` |
| **Type** | `textarea` (`<textarea rows="6">`) |
| **Required** | Yes |
| **Placeholder** | `How can we help?` |
| **Helper text** | `Include timeline and the specific product you're asking about if relevant.` |
| **`autoComplete`** | `off` |
| **Rows** | 6 |
| **Min height (CSS)** | `140px` |
| **Min length (server)** | 10 characters |
| **Max length (server)** | 5 000 characters |
| **Pattern/format** | Free text, multi-line |
| **Deep-link prefill** | `/contact?product=P1` → auto-injects: `"I'd like to inquire about Biodegradable Razor."` (same for P2–P5) |
| **CRM suggestion** | Lead / Opportunity → Description / Notes (long text) |

---

## 3. Form #2 — Hotel Pilot Registration Form (`/for-hotels`)

### Form Metadata

| Property | Value |
|---|---|
| **Form name (internal)** | `for_hotels` |
| **Route** | `/for-hotels` |
| **API endpoint** | `POST /api/for-hotels` |
| **Submit button label** | `Register hotel interest` |
| **Success message (inline + server)** | `Thank you. We'll reply within 2 business days with next steps.` |
| **Lead type (GA4)** | `hotel_pilot` |
| **Number of fields** | 8 (3 required, 5 optional) |
| **Has groups?** | Yes — 4 sections with counter: `1 / 4 · About you`, `2 / 4 · Your property`, `3 / 4 · What you want to pilot`, `4 / 4 · Context` |
| **Confirm email sent?** | Yes |

### Fields Detail — Group 1/4: "About you"

#### 3.1 `fullName` — Full name

| Attribute | Value |
|---|---|
| **HTML `id`** | `fullName` |
| **HTML `name`** | `fullName` |
| **Label** | `Full name *` |
| **Type** | `text` (`<input type="text">`) |
| **Required** | Yes |
| **Placeholder** | `Your name` |
| **Helper text** | `Who should we speak with for procurement and approvals?` |
| **`autoComplete`** | `name` |
| **Min length (server)** | 2 characters |
| **Max length (server)** | 100 characters |
| **CRM suggestion** | Contact → Full Name |

#### 3.2 `email` — Email address

| Attribute | Value |
|---|---|
| **HTML `id`** | `email` |
| **HTML `name`** | `email` |
| **Label** | `Email address *` |
| **Type** | `email` (`<input type="email">`) |
| **Required** | Yes |
| **Placeholder** | `you@hotel.com` |
| **Helper text** | `Use a work email if you can.` |
| **`autoComplete`** | `email` |
| **Pattern/format** | RFC 5322 simplified regex |
| **CRM suggestion** | Contact → Primary Email |

### Fields Detail — Group 2/4: "Your property"

#### 3.3 `hotelName` — Hotel / property name

| Attribute | Value |
|---|---|
| **HTML `id`** | `hotelName` |
| **HTML `name`** | `hotelName` |
| **Label** | `Hotel / property name *` |
| **Type** | `text` (`<input type="text">`) |
| **Required** | Yes |
| **Placeholder** | `Property name` |
| **Helper text** | `The name your guests see.` |
| **`autoComplete`** | `off` |
| **Min length (server)** | 2 characters |
| **Max length (server)** | 150 characters |
| **CRM suggestion** | Account / Hotel Property → Property Name |

#### 3.4 `starRating` — DOT star rating

| Attribute | Value |
|---|---|
| **HTML `id`** | `starRating` |
| **HTML `name`** | `starRating` |
| **Label** | `DOT star rating` |
| **Type** | `select` (`<select>` dropdown) |
| **Required** | No (optional) |
| **Helper text** | `If you're unrated, choose "Unrated".` |
| **Max length (server)** | 50 characters |
| **Options (label → value)** | |
| &nbsp;&nbsp;— default | `Select a rating` → `""` (empty string, treated as "none") |
| &nbsp;&nbsp;— option 1 | `3-Star` → `3-Star` |
| &nbsp;&nbsp;— option 2 | `4-Star` → `4-Star` |
| &nbsp;&nbsp;— option 3 | `5-Star` → `5-Star` |
| &nbsp;&nbsp;— option 4 | `Unrated` → `Unrated` |
| **CRM suggestion** | Hotel Property → Star Rating picklist: `[ "", "3-Star", "4-Star", "5-Star", "Unrated" ]` |

#### 3.5 `roomCount` — Approximate room count

| Attribute | Value |
|---|---|
| **HTML `id`** | `roomCount` |
| **HTML `name`** | `roomCount` |
| **Label** | `Approximate room count` |
| **Type** | `select` (`<select>` dropdown) |
| **Required** | No (optional) |
| **Helper text** | `A range is fine. It helps us estimate first-batch demand.` |
| **Max length (server)** | 50 characters |
| **Options (label → value)** | |
| &nbsp;&nbsp;— default | `Select room count` → `""` (empty) |
| &nbsp;&nbsp;— option 1 | `<50` → `<50` |
| &nbsp;&nbsp;— option 2 | `50–100` → `50–100` |
| &nbsp;&nbsp;— option 3 | `101–200` → `101–200` |
| &nbsp;&nbsp;— option 4 | `200+` → `200+` |
| **CRM suggestion** | Hotel Property → Room Count Range picklist, or two numeric fields (min/max) derived from the band |

### Fields Detail — Group 3/4: "What you want to pilot"

#### 3.6 `interests` — Which products interest you?

| Attribute | Value |
|---|---|
| **HTML `id` (fieldset group)** | `interests` |
| **HTML `name` (each checkbox)** | `interests` |
| **Label (legend)** | `Which products interest you?` |
| **Type** | `checkbox-group` (`<fieldset>` + 5 checkboxes) |
| **Required** | No (optional — but UX helper says "pick all that apply") |
| **Helper text** | `Pick all that apply. Start with the most urgent replacements.` |
| **Value shape in POST** | `string[]` (array of product IDs, e.g. `["P1","P3","P5"]`; normalized server-side) |
| **Checkbox id pattern** | `interests-<productId>` e.g. `interests-P1`, `interests-P2` |

| # | Product ID (value) | Product Name (label) | Badge |
|---|---|---|---|
| 1 | `P1` | `Biodegradable Razor` | Guest amenity |
| 2 | `P2` | `Coconut-Husk Slippers` | Guest footwear |
| 3 | `P3` | `Shampoo & Soap Bar Holder` | Bar program accessory |
| 4 | `P4` | `Back-of-House Essentials` | Housekeeping & back-of-house |
| 5 | `P5` | `Biodegradable Bin Liner` | Room waste management |

| CRM suggestion | Lead/Opportunity → Product Interest multi-select picklist (values are P1–P5; labels above). Maps to Opportunity Line Items in a many-to-many junction. |

### Fields Detail — Group 4/4: "Context"

#### 3.7 `source` — How did you hear about us?

| Attribute | Value |
|---|---|
| **HTML `id`** | `source` |
| **HTML `name`** | `source` |
| **Label** | `How did you hear about us?` |
| **Type** | `select` (`<select>` dropdown) |
| **Required** | No (optional) |
| **Helper text** | `Helps us track where pilots come from.` |
| **Max length (server)** | 100 characters |
| **Options (label → value)** | |
| &nbsp;&nbsp;— default | `Select a source` → `""` (empty) |
| &nbsp;&nbsp;— option 1 | `Referral` → `Referral` |
| &nbsp;&nbsp;— option 2 | `LinkedIn` → `LinkedIn` |
| &nbsp;&nbsp;— option 3 | `Search` → `Search` |
| &nbsp;&nbsp;— option 4 | `Event` → `Event` |
| &nbsp;&nbsp;— option 5 | `Other` → `Other` |
| **CRM suggestion** | Lead Source / Campaign Source picklist: `["Referral","LinkedIn","Search","Event","Other"]` |

#### 3.8 `message` — Message

| Attribute | Value |
|---|---|
| **HTML `id`** | `message` |
| **HTML `name`** | `message` |
| **Label** | `Message` |
| **Type** | `textarea` (`<textarea rows="5">`) |
| **Required** | No (optional) |
| **Placeholder** | `Tell us about your property or rollout timeline.` |
| **Helper text** | `Share rollout timing, purchasing constraints, and any non-negotiables.` |
| **`autoComplete`** | `off` |
| **Rows** | 5 |
| **Min height (CSS)** | `140px` |
| **Max length (server)** | 3 000 characters |
| **CRM suggestion** | Opportunity / Lead → Description / Notes (long text) |

---

## 4. Form #3 — Product Inquiry API (No UI)

This endpoint exists server-side and is fully validated but **no page renders a form for it yet**. It is included for completeness because a CRM should accept these records programmatically (e.g. from a future SKU-specific widget, partner portal, or Shopify-style flow).

### Form Metadata

| Property | Value |
|---|---|
| **Form name (internal)** | `inquiry` (de facto) |
| **Route** | None (API-only) |
| **API endpoint** | `POST /api/inquiry` |
| **Success message** | `Inquiry submitted successfully!` |
| **Number of fields** | 5 (4 required, 1 optional) |
| **Confirm email sent?** | No |

### Fields Detail

#### 4.1 `name` — Company Name

| Attribute | Value |
|---|---|
| **Label (server)** | `Company Name` |
| **Type** | `text` (presumed; no UI) |
| **Required** | Yes |
| **Min length** | 2 characters |
| **Max length** | 100 characters |
| **CRM suggestion** | Account → Company Name |

#### 4.2 `email` — Email

| Attribute | Value |
|---|---|
| **Label (server)** | `Email` |
| **Type** | `email` |
| **Required** | Yes |
| **Pattern** | RFC 5322 simplified regex |
| **CRM suggestion** | Contact → Primary Email |

#### 4.3 `product` — Product Interest

| Attribute | Value |
|---|---|
| **Label (server)** | `Product Interest` |
| **Type** | `text` (presumed free text or SKU id; no UI) |
| **Required** | Yes |
| **Min length** | 2 characters |
| **Max length** | 100 characters |
| **CRM suggestion** | Opportunity → Product / SKU of Interest |

#### 4.4 `quantity` — Estimated Volume

| Attribute | Value |
|---|---|
| **Label (server)** | `Estimated Volume` |
| **Type** | `text` (presumed numeric-ish, labelled "sqm" in email template) |
| **Required** | Yes |
| **Min length** | 1 character |
| **Max length** | 50 characters |
| **CRM suggestion** | Opportunity → Quantity / Estimated Volume (numeric or text) |

#### 4.5 `additionalInfo` — Additional Information

| Attribute | Value |
|---|---|
| **Label (server)** | `Additional Information` |
| **Type** | `textarea` (presumed multi-line) |
| **Required** | No (optional) |
| **Max length** | 2 000 characters |
| **CRM suggestion** | Opportunity → Description / Notes |

---

## 5. Common Field Behaviour & Anti-Spam

### 5.1 Honeypot (Anti-Bot Trap) — Present on ALL 3 forms

| Attribute | Value |
|---|---|
| **HTML `id`** | `website_field_hp` |
| **HTML `name`** | `website_field_hp` |
| **Type** | `text` (`<input type="text">`) |
| **Label** | `Leave this field blank` |
| **CSS hiding** | `position:absolute; left:-9999px; width:1px; height:1px; overflow:hidden` |
| **`tabIndex`** | `-1` (not in keyboard focus order) |
| **`autoComplete`** | `off` |
| **Server behaviour** | If non-empty → submission is **silently dropped** with normal success response (no error, no email sent). Bot oracle prevented. |
| **Recoverability** | Server logs the email address of honeypot hits for manual recovery (password-manager false-positives). |
| **CRM implication** | **Never store a record where `website_field_hp` is non-empty.** Treat as bot. |

### 5.2 HTML `id` Convention

For every real field, the HTML element's `id` is **identical to `name`**:

```
id={field.name}  ← same as ←  name={field.name}
```

Exception: checkboxes in a `checkbox-group` get suffixed ids:
```
id={`${field.name}-${option.value}`}   e.g. id="interests-P1"
name={field.name}                     all share the same name "interests"
```

### 5.3 Error Element IDs

Each field's inline error `<span>` uses:
```
id={`${field.name}-error`}
```
Referenced by the input via `aria-describedby="${field.name}-error"`.

---

## 6. Server-Side Validation Summary

### 6.1 General Contact Form (`submitContact`)

| Field name | Required? | Server rules |
|---|---|---|
| `name` | Yes | min 2, max 100 chars |
| `email` | Yes | valid email regex (RFC 5322 simplified) |
| `company` | Yes | min 2, max 150 chars |
| `role` | Yes | min 2, max 100 chars |
| `message` | Yes | min 10, max 5 000 chars |

### 6.2 Hotel Pilot (`submitHotelInterest`)

| Field name | Required? | Server rules |
|---|---|---|
| `fullName` | Yes | min 2, max 100 chars |
| `email` | Yes | valid email regex |
| `hotelName` | Yes | min 2, max 150 chars |
| `starRating` | No | max 50 chars |
| `roomCount` | No | max 50 chars |
| `interests[]` | No | array of strings; normalized to clean, non-empty strings only |
| `source` | No | max 100 chars |
| `message` | No | max 3 000 chars |

### 6.3 Product Inquiry (`submitInquiry`)

| Field name | Required? | Server rules |
|---|---|---|
| `name` | Yes | min 2, max 100 chars |
| `email` | Yes | valid email regex |
| `product` | Yes | min 2, max 100 chars |
| `quantity` | Yes | min 1, max 50 chars |
| `additionalInfo` | No | max 2 000 chars |

### 6.4 Validation Error Response Shape

```json
{
  "message": "Validation failed.",
  "details": {
    "<fieldName>": "<human readable error message>"
  }
}
```

HTTP status: **400 Bad Request**. The `details` keys map 1:1 to form field `name`s.

---

## 7. Hidden Metadata Fields (Sent With Every Submission)

The following are **NOT user-facing** but are appended by `ContactForm.tsx` in the POST body. Your CRM should capture these as (a) audit fields on the record and (b) for attribution reporting.

| Body key | Type | Source / Meaning |
|---|---|---|
| `website_field_hp` | `string` | Honeypot. MUST be empty for a valid human submission. |
| `_attribution` | `object \| null` | UTM + referrer cookie set by first landing. Structure: see `lib/attribution.ts` and `lib/attributionHelpers.js`. Keys commonly include `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `referrer`, `landing_path`, `first_seen`. |
| `_analytics.gaClientId` | `string \| null` | GA4 `client_id` (cid) cookie value. Used later to join the lead back to its GA4 session for offline conversion import. Null if user declined analytics consent. |
| `_engagement.accountCode` | `string \| null` | Internal account identifier (if a returning/known visitor). From engagement cookie. |
| `_engagement.tier` | `string` | Engagement tier derived from session behaviour. Possible values (in lib/engagement.ts): `"tier_1"` (casual browser) → `"tier_4"` (deep research, multi-page, multi-visit). |
| `_engagement.evidenceCount` | `number` | Count of evidence/social-proof figures the visitor has been exposed to across pages. |
| `_engagement.pageCount` | `number` | Total pages viewed (current + prior visits, from cookie). |

Additionally, on the server side **before the email is sent**:

| Derived field | Source | Meaning |
|---|---|---|
| IP + Geo | `extractClientIp()` → `getGeoFromIp()` | Country, Region, City, ISP-level lookup of the submitter's IP. Catch-swallowed (falls back to empty object silently). Included in the "Attribution & Location" block of the internal notification email. |

**CRM recommendation**: Store `_attribution`, `_analytics`, and `_engagement` as JSON fields on Lead / Contact. Map `_engagement.tier` to a picklist "Engagement Tier" for quick segmentation.

---

## 8. API Endpoints & Rate Limiting

### 8.1 Endpoints

| Endpoint | Method | Handler | API route file |
|---|---|---|---|
| `/api/contact` | `POST` | `submitContact()` | [app/api/contact/route.js](file:///Users/bluestella/repositories/bughaw-innovations/app/api/contact/route.js) |
| `/api/for-hotels` | `POST` | `submitHotelInterest()` | [app/api/for-hotels/route.js](file:///Users/bluestella/repositories/bughaw-innovations/app/api/for-hotels/route.js) |
| `/api/inquiry` | `POST` | `submitInquiry()` | [app/api/inquiry/route.js](file:///Users/bluestella/repositories/bughaw-innovations/app/api/inquiry/route.js) |

All 3 routes share identical HTTP shape:
- **Request body**: `application/json` (object matching fields above)
- **Success response** (HTTP 200): `{ "message": "<form-specific success string>" }`
- **Validation error** (HTTP 400): `{ "message": "Validation failed.", "details": { [field]: string } }`
- **Rate-limit breach** (HTTP 429): `{ "message": "..." }` (with `Retry-After` header)
- **Generic error** (HTTP 500): `{ "message": "Sanitised message, no raw error details exposed" }`

### 8.2 Rate Limiting

All three endpoints call `checkRateLimit()` and return `getRateLimitHeaders()`. Throttled submissions get HTTP 429. Your CRM ingestion pipeline should honour 429 + `Retry-After` if mirroring submissions in real-time.

---

## 9. Email Confirmation Matrix

| Form | Internal notification email | Auto-reply to submitter |
|---|---|---|
| **Contact** | Yes → `hello@bughawinnovations.ph` (reply-to = submitter's email) | Yes → form `contact` template via `sendLeadConfirmation()` |
| **For Hotels** | Yes → `hello@` (subject: `New hotel interest from {hotelName}`) | Yes → form `hotel` template via `sendLeadConfirmation()` |
| **Inquiry (API)** | Yes → `hello@` (subject: `New Inquiry from {name}`) | **No** — submitter gets no confirmation email |

Internal email body structure for all three is a flat `"<strong>Label:</strong> Value"` HTML block with:
1. All user-facing fields in declaration order
2. One final "Attribution & Location" multi-line block merging `_attribution`, IP-derived geo, `_analytics.gaClientId`, and `_engagement.*`

---

## 10. CRM Entity Mapping Recommendations

### 10.1 Recommended Entities & Relationships

```
Account (Company / Hotel Property)
  │
  ├─ id
  ├─ name  ← contact.company  or  hotel.hotelName
  ├─ hotel_star_rating  ← starRating (picklist: "", 3-Star, 4-Star, 5-Star, Unrated)
  ├─ hotel_room_count_band  ← roomCount (picklist: "", <50, 50–100, 101–200, 200+)
  ├─ industry (default: "Hospitality" if from for_hotels)
  └─ …
       │
       └── Contact (Person at Account)
            ├─ id
            ├─ account_id (FK)
            ├─ full_name  ← name  or  fullName
            ├─ email  ← email (unique key)
            ├─ job_title  ← role
            └─ …
                 │
                 └── Lead / Opportunity
                      ├─ id
                      ├─ contact_id (FK)
                      ├─ origin_form  ← enum: "contact" | "for_hotels" | "inquiry_api"
                      ├─ lead_type  ← "general" | "hotel_pilot" (GA4 alignment)
                      ├─ source  ← source (picklist: Referral, LinkedIn, Search, Event, Other)
                      ├─ product_interests  ← interests[] (multi-select: P1–P5)
                      ├─ product_of_interest  ← inquiry.product (for API-only form)
                      ├─ estimated_volume  ← inquiry.quantity
                      ├─ description  ← message | additionalInfo (long text)
                      ├─ engagement_tier  ← _engagement.tier (picklist: tier_1..tier_4)
                      ├─ ga_client_id  ← _analytics.gaClientId
                      ├─ attribution_json  ← _attribution (JSON/long text)
                      ├─ engagement_json  ← _engagement (JSON/long text)
                      ├─ geo_json  ← server-derived IP geo (JSON)
                      ├─ honeypot_clean  ← boolean(website_field_hp === "")
                      └─ created_at / submitted_at
```

### 10.2 Deduplication Key

| Form | Natural dedupe key |
|---|---|
| `contact` | `email` (primary) + `company` (secondary) |
| `for_hotels` | `email` (primary) + `hotelName` (secondary) |
| `inquiry` | `email` (primary) + `product` (secondary) |

Same email across multiple forms → upsert Contact; create new Lead/Opportunity per submission.

### 10.3 Lead Status Suggestions

- **New** — just submitted, not yet assigned
- **Acknowledged** — 1-business-day receipt confirmed
- **Qualified** — founder/founding team has replied (2 business days SLA)
- **Pilot Scoping** — for `hotel_pilot` leads: sizing SKUs + rooms
- **Closed Won** — pilot booked / PO received
- **Closed Lost** — no fit, timing, capacity

### 10.4 SLA Reminders (from site copy)

| Form | Response promise |
|---|---|
| Contact | 2 business days (page) / 3 business days (server confirmation email) |
| For Hotels | 2 business days (page + server) |
| Inquiry API | No stated SLA (no confirm email yet) |

---

*End of audit. All field names, IDs, and limits are exact values extracted from `constants.ts`, `formSubmissions.js`, and `ContactForm.tsx`.*
