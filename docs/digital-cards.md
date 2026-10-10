# Digital Business Cards

> Feature plan, decisions, and the security design for the Suite's first
> public surface. Product-owner + engineering view. Status: **v1 built**
> (migration `0009_digital_cards.sql`, `/admin/cards`, `/c/<token>`).

## 1. Why

Bughaw's team meets hotel GMs, purchasing heads, LGU officers and funders at
site visits, trade events and on Viber/Messenger. Paper cards run out, go
stale when titles change, and tell us nothing about follow-through. A digital
card fixes all three. It is a live page the team can update without
reprinting. People share it by QR, link, NFC tap or email signature, and it
records whether it was opened and saved.

The reference we studied was Uniqode's guide to virtual business cards
([uniqode.com/blog/virtual-business-card/comprehensive-guide-to-virtual-business-cards](https://www.uniqode.com/blog/virtual-business-card/comprehensive-guide-to-virtual-business-cards)).
Our sandbox couldn't fetch that page, so its contents were reconstructed from
Uniqode's own product, FAQ, security and pricing pages via search. Those are
vendor claims.

## 2. Feature inventory: industry vs. what we build

| Capability (industry, per Uniqode) | Bughaw v1 | Notes |
|---|---|---|
| Card profile: name, title, photo, contact, links | ✅ | Name, title, 150-char bio, photo **by URL**, work email, mobile, Viber, LinkedIn, Facebook, Instagram, website |
| Company section + call to action | ✅ | Editable blurb (≤400 chars) and one CTA, defaulting to the hotel-pilot form at `bughawinnovations.ph/for-hotels` |
| Share by link | ✅ | `/c/<random token>` |
| Share by QR code | ✅ | Branded SVG/PNG generated in the admin (in-browser, no third party) |
| Share by NFC tap | ✅ | We supply the URL to write to any NFC sticker/card. We don't sell or encode tags. |
| Email-signature card | ✅ | Copy-paste HTML block for Gmail/Outlook |
| Save to contacts without an app | ✅ | vCard 3.0 (`.vcf`) download |
| Apple / Google Wallet pass | ✅ built, **off until keys exist** | See §6 |
| Analytics: views, saves, clicks, by time/device/source | ✅ | Counts only. No location, no unique visitors (§5) |
| Admin: central create/edit/suspend/revoke | ✅ | super_admin only. Rotate link revokes every old QR/NFC/signature. |
| Brand-locked template | ✅ | One Bughaw template. Admins edit content, not design. |
| Two-way contact exchange / lead capture | ❌ v1 | Deliberately excluded. It would be an anonymous write of personal data (§8). |
| Bulk creation from spreadsheet | ❌ | ~a dozen people. Not worth it yet. |
| Directory sync (Entra/Google), SSO/SAML | ❌ | Suite auth already covers admins |
| Visitor location, unique visitors | ❌ | Privacy decision (§5) |
| Paper-card scanner, CRM auto-push | ❌ | Candidate for v2 via the existing CRM |
| GA / Meta Pixel on cards | ❌ | Third-party trackers on a page we hand to hotel buyers is off-posture |

## 3. Decisions log (agreed with the founder, Oct 2026)

| # | Decision | Choice |
|---|---|---|
| D1 | Should the internal app get a public layer at all? | **Yes, exactly one route**: `/c/<token>`, inside this app. Everything else stays invite-only. |
| D2 | Who manages cards and sees analytics? | **super_admin only**, in one admin section (`/admin/cards`, tabs *Cards* + *Analytics*). Members and contractors see nothing (route **and** RLS). |
| D3 | Lead capture on the public card? | **Not in v1.** The public page is read-only apart from analytics counters. |
| D4 | Analytics depth | **Counts only.** Event, timestamp, source (link/QR/NFC/email), coarse device class. No IP, cookie, fingerprint or location. |
| D5 | URL format | **Random 12-char base62 token** (~70 bits), not a name slug, so cards can't be enumerated. Rotatable. |
| D6 | Sharing methods | Link + QR, `.vcf`, email signature, Apple/Google Wallet (built behind env keys). NFC via the same URL. |
| D7 | Public fields | Work email + title, mobile/Viber (per-card opt-in), social links, company blurb + CTA, bio **≤150 characters**. |
| D8 | Photos | **Pasted https URL.** No upload feature, no storage bucket. |
| D9 | Event logging | An anonymous, insert-only, throttled RPC is acceptable. |

## 4. How it works

```
Visitor (no login)                         super_admin (signed in)
   │  GET /c/<token>?s=qr                      │  /admin/cards
   ▼                                           ▼
middleware: /c/* passes untouched          middleware: session + role
   │  (+ X-Robots-Tag: noindex)                │
   ▼                                           ▼
get_public_card(token)  ── security definer ── business_cards  ◄── RLS: super_admin only
record_card_event(...)  ── security definer ── business_card_events ◄── RLS: super_admin read
                                               admin_card_event_rollup(days) → jsonb
                                               admin_rotate_card_token(id)
```

- **Statuses**: `draft` (private), `published` (public via link), `suspended`
  (link disabled, card kept). Unknown, draft, suspended and rotated tokens all
  get the same "This card isn't available" page.
- **Public routes** (`src/app/c/[token]/`): the page itself, `vcard` (GET),
  `event` (POST click beacon), `wallet/apple`, `wallet/google`.
- **Attribution**: QR codes encode `?s=qr`, NFC links `?s=nfc`, signatures
  `?s=email`. Anything else counts as `link`.
- **Preview**: the admin editor renders the same `PublicCardView` component the
  public page uses, so what you see is what visitors get.

## 5. Analytics: what is recorded, and what isn't

Each row in `business_card_events` is `(card, event, target?, source, device,
occurred_at)`. Nothing else is stored.

| Event | When |
|---|---|
| `view` | The public page renders for a non-bot user agent |
| `save_contact` | The `.vcf` is downloaded |
| `click` | A contact/link/CTA on the card is tapped (`target` says which) |
| `wallet_apple` / `wallet_google` | A wallet pass is issued |

- **Excluded**: crawlers, link-preview fetchers (Messenger, Viber, Slack,
  Telegram…), headless browsers, scripts.
- **Not identified**: no IP, cookie, or fingerprint, so repeat visits count
  again and there's no "unique visitors" figure. This keeps the card out of
  consent-banner territory under the Data Privacy Act.
- **Throttled**: at most 60 events/minute per card and 600/minute overall.
  Excess is dropped silently.
- **Reporting**: `admin_card_event_rollup(days)` returns grouped counts as a
  single JSON value, bucketed by Asia/Manila day. `summarizeCardEvents()`
  (`src/lib/cards.ts`, unit-tested) shapes it for the dashboard.
- **Known skew**: an admin clicking "Open" on their own card counts as a view.

## 6. Wallet passes (built, dormant)

Both wallets need server-side signing keys. These are the first non-public
secrets this app has ever had. They are read only in
`src/app/c/[token]/wallet/*/route.ts` through `src/lib/wallet.ts`. Until all
variables are set, the routes return 404 and the buttons stay hidden.

- **Apple**: paid Apple Developer account → Pass Type ID + certificate. Set
  `APPLE_PASS_TYPE_ID`, `APPLE_TEAM_ID`, `APPLE_PASS_CERT_PEM`,
  `APPLE_PASS_KEY_PEM`, `APPLE_PASS_KEY_PASSPHRASE` (optional),
  `APPLE_WWDR_CERT_PEM`.
- **Google**: Google Wallet issuer account + a Google Cloud service account
  with Wallet access. Set `GOOGLE_WALLET_ISSUER_ID`,
  `GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_WALLET_PRIVATE_KEY`.
- Store PEMs in Vercel env with `\n` for newlines. Never prefix them with
  `NEXT_PUBLIC_`.
- Passes carry the card's QR (pointing back to the live page), so a rotated
  link also kills the pass's QR.

## 7. Brand rules applied

Per the Bughaw design system, the public card uses the HTML mode: Deep Green
hero band, cream body, dark footer, and a 3px gold rule. Filipino display copy
(*"Ikinagagalak kitang makilala."*) is set in the serif and operational English
in the sans. Content guardrails are enforced in the editor hints and the
default copy:

- No certification or partnership claims without a signed document.
- Our material is described as **coir and cassava starch**, never plastic.
- No cost or process detail.

## 8. Security design (summary; full detail in [security.md](security.md) §8)

- **No table is readable or writable by `anon`.** The public page can only call
  `get_public_card` (published rows, display-safe columns, phone only when
  opted in) and `record_card_event` (validated vocabulary, insert-only,
  throttled, returns nothing).
- **Unguessable, revocable URLs**: random token, `admin_rotate_card_token`,
  `suspended` status.
- **No indexing**: `X-Robots-Tag: noindex` and robots metadata on `/c/*`.
- **Input hardening**: https-only URLs, phone character whitelist, length caps.
  These are enforced by DB check constraints and mirrored in `validateCard()`.
  All text is rendered via React. The email-signature HTML is escaped and
  never rendered in-app.
- **The click beacon** accepts same-origin requests only and always answers
  204, so it can't be used to probe tokens.
- **Why no lead capture yet**: it would let anyone on the internet write
  personal data into our database. If we add it (v2), it should reuse the
  CRM ingest pattern (honeypot, validation, consent text, a security-definer
  insert) and land as a CRM lead with source "business card".

## 9. Roadmap candidates (not committed)

1. **v2 lead capture → CRM** (D3 revisited), with consent copy and a honeypot.
2. **Turn on wallets** once Apple/Google accounts exist (no code change).
3. **Member self-service**: members edit their own card's content (needs an
   `owner_email`-scoped RLS update policy and a column whitelist).
4. **Custom short domain** for cards (e.g. `card.bughawinnovations.ph`). Set
   `NEXT_PUBLIC_SITE_URL` and reissue QR codes.
5. **Photo upload** to a public storage bucket, if pasted URLs prove brittle.
6. **Event retention**: purge events older than ~13 months with a scheduled job.
