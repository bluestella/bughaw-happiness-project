# Prompt — mirror bughawinnovations.ph form submissions into the Bughaw CRM

> **How to use this file:** paste the whole thing as the opening prompt to an agent
> working in the **`bughaw-innovations` marketing-site repo**. It is written to be
> self-contained — the agent does not need access to the CRM repo.

---

## Task

Bughaw now runs an internal CRM (the Bughaw Suite app). Every submission to the
three public forms on this site must be mirrored into it, in addition to the emails
that already go out. Nothing about the visitor's experience may change.

Add a **non-blocking, non-fatal** mirror call to the CRM ingest endpoint in
`formSubmissions.js`, in all three handlers:

| Handler | Form value to send |
|---|---|
| `submitContact()` | `"contact"` |
| `submitHotelInterest()` | `"for_hotels"` |
| `submitInquiry()` | `"inquiry"` |

**Hard requirements**

1. The mirror runs **after** the existing validation passes and **after** the
   internal notification email is sent. A CRM failure must never turn a successful
   submission into an error for the visitor.
2. The call is wrapped in `try/catch`, has a **timeout**, and on failure only logs.
   The visitor still gets the normal success response.
3. The secret is **server-side only**. Never `NEXT_PUBLIC_`, never in the client
   bundle, never in a response body.
4. Do not change any field names, validation rules, response messages, or the
   honeypot behaviour. This is additive.

---

## The endpoint

```
POST {CRM_URL}/api/crm/ingest
Content-Type: application/json
x-bughaw-ingest-secret: {CRM_INGEST_SECRET}
```

Two new server-side environment variables (add both to `.env.example` and set them
in the site's Vercel project):

| Variable | Value |
|---|---|
| `CRM_URL` | Base URL of the Bughaw Suite deployment, no trailing slash |
| `CRM_INGEST_SECRET` | The shared secret. Ask the owner — it is stored in the CRM's `crm_ingest_secrets` table and is not in either repo. |

If either variable is missing, skip the mirror silently. The site must still deploy
and work with them unset.

### Request body

The body is **the submission payload you already have**, plus a `form`
discriminator. Send the field names exactly as the form uses them today — the CRM
was built from an audit of this repo and expects these spellings.

**`form: "contact"`**
```json
{
  "form": "contact",
  "name": "string", "email": "string", "company": "string",
  "role": "string", "message": "string",
  "website_field_hp": "",
  "_attribution": { }, "_analytics": { }, "_engagement": { }, "_geo": { }
}
```

**`form: "for_hotels"`**
```json
{
  "form": "for_hotels",
  "fullName": "string", "email": "string", "hotelName": "string",
  "starRating": "", "roomCount": "", "interests": ["P1", "P3"],
  "source": "", "message": "",
  "website_field_hp": "",
  "_attribution": { }, "_analytics": { }, "_engagement": { }, "_geo": { }
}
```

**`form: "inquiry"`**
```json
{
  "form": "inquiry",
  "name": "string", "email": "string", "product": "string",
  "quantity": "string", "additionalInfo": "",
  "website_field_hp": "",
  "_attribution": { }, "_analytics": { }, "_engagement": { }, "_geo": { }
}
```

Notes on the metadata block:

- `_attribution`, `_analytics`, `_engagement` — pass through **verbatim** from the
  request body. The CRM stores them as JSON and reads `_engagement.tier` and
  `_analytics.gaClientId` into queryable columns. Omit or send `null` if absent.
- `_geo` — **new, optional, and worth adding.** The handlers already derive IP geo
  via `extractClientIp()` → `getGeoFromIp()` for the internal email. Pass that same
  object here so the CRM keeps it too. Send `null` if the lookup failed.
- `website_field_hp` — forward it verbatim rather than stripping it. The CRM applies
  the same honeypot rule independently: a non-empty value means the submission is
  **dropped without being stored**, and the response is still `200` so no bot gets an
  oracle. If your handler already returns early on a honeypot hit, that early return
  stays as it is — just do not sanitise the field on the way out.

### Responses

| Status | Body | Meaning |
|---|---|---|
| `200` | `{"message": "...", "status": "ok"}` | Recorded |
| `200` | `{"message": "...", "status": "dropped"}` | Honeypot hit, deliberately not stored |
| `400` | `{"message": "Validation failed.", "details": {"<field>": "<reason>"}}` | Payload failed the CRM's copy of this site's own rules |
| `401` | `{"message": "Unauthorized."}` | Missing or wrong secret |
| `500` | `{"message": "Could not record the submission."}` | CRM-side problem |

The CRM enforces the **same validation rules as this site** (min/max lengths, the
`/^[^\s@]+@[^\s@]+\.[^\s@]+$/` email regex). A `400` therefore means the two
validators have drifted — log it loudly, it is a bug worth fixing, not a visitor
problem.

---

## Reference implementation

Put this in a small helper (e.g. `lib/crmMirror.js`) and call it from each handler
rather than pasting the block three times.

```js
/**
 * Mirror a form submission into the internal CRM.
 * Fire-and-forget: never throws, never blocks the visitor's response.
 */
export async function mirrorToCrm(form, payload) {
  const base = process.env.CRM_URL;
  const secret = process.env.CRM_INGEST_SECRET;
  if (!base || !secret) return;

  try {
    const res = await fetch(`${base}/api/crm/ingest`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bughaw-ingest-secret": secret,
      },
      body: JSON.stringify({ form, ...payload }),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[crm-mirror] ${form} failed: ${res.status} ${detail}`);
    }
  } catch (err) {
    console.error(`[crm-mirror] ${form} error`, err);
  }
}
```

Call site, inside `submitHotelInterest()` — after the email send, before the success
response:

```js
await mirrorToCrm("for_hotels", {
  fullName, email, hotelName, starRating, roomCount, interests, source, message,
  website_field_hp: body.website_field_hp ?? "",
  _attribution: body._attribution ?? null,
  _analytics: body._analytics ?? null,
  _engagement: body._engagement ?? null,
  _geo: geo ?? null,          // the object already built for the email
});
```

`await` is fine here — the timeout caps the added latency at 4s worst case, and it
keeps the call alive on serverless where a floating promise can be killed when the
response is returned. If you would rather not add any latency at all, use
`waitUntil()` from `@vercel/functions` instead of `await`; do **not** simply drop the
`await` and leave a dangling promise.

---

## Deduplication — context, no work required

You do not need to do anything about duplicates. For your information: the CRM
upserts a **Contact** on the normalised email and an **Account** on the normalised
company/hotel name, then always inserts a **new Lead** row per submission. So the
same person submitting twice produces one contact and two leads. Send every
submission; do not try to filter repeats.

---

## Definition of done

- [ ] `CRM_URL` and `CRM_INGEST_SECRET` are in `.env.example` (empty values) and set
      in Vercel for the site. Neither is prefixed `NEXT_PUBLIC_`.
- [ ] All three handlers mirror after their email send, wrapped and timeout-capped.
- [ ] With both env vars unset, all three forms still work exactly as before.
- [ ] With a deliberately wrong secret, all three forms still return their normal
      success response to the visitor, and a `401` is logged.
- [ ] A real submission on each form returns `{"status": "ok"}` from the CRM.
- [ ] A submission with `website_field_hp` filled returns `{"status": "dropped"}`.
- [ ] No secret appears in any client bundle: `grep -r "CRM_INGEST_SECRET" .next/static`
      finds nothing.
- [ ] Lint, tests, and build pass.

## Do not

- Do not retry failed calls in a loop, or queue them. At-most-once is the agreed
  behaviour; a missed lead is recoverable from the notification email.
- Do not change the visitor-facing success/error messages or the response shape of
  `/api/contact`, `/api/for-hotels`, or `/api/inquiry`.
- Do not send anything the visitor did not submit plus the metadata listed above —
  no cookies, no raw headers, no session tokens.
