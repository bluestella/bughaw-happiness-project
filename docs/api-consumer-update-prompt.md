# Prompt: update a Bughaw Suite API consumer to the hardened contract

> **How to use this file:** paste the whole file as the opening prompt to an agent
> working in a repo that **calls the Bughaw Suite API**. Today that is the
> `bughaw-innovations` marketing site, which posts to `/api/crm/ingest`. The prompt
> is self-contained, so the agent needs no access to the Suite repo. If the
> consumer has not integrated yet, give it
> [crm-ingest-integration-prompt.md](crm-ingest-integration-prompt.md) first, then
> this file.

---

## Context

The Bughaw Suite hardened its API endpoints. The changes are **backward
compatible**: an existing integration keeps working unchanged. Your task is to
adopt the new contract so failures are classified correctly, logs can be traced
across both systems, and the client follows the same practices as the server.

### What changed on the server

1. **Every response now has a `requestId`** in the JSON body and an
   `X-Request-Id` header. If you send `x-request-id` (8 to 128 characters from
   `A-Z a-z 0-9 . _ : -`), the server echoes your value. Otherwise it generates
   one.
2. **Errors carry a machine-readable `code`.** `message` and `details` are
   unchanged.
   ```json
   { "message": "Validation failed.", "code": "validation_failed", "requestId": "…", "details": { "email": "Enter a valid email address." } }
   ```
3. **Stricter input checks**, returned before any database work:
   - `Content-Type` must be `application/json`, or the server returns **415**
     `unsupported_media_type`.
   - Bodies over **64 KiB** get **413** `payload_too_large`.
   - A secret header over 256 characters gets **401**.
4. **Database validation errors are now 400, not 500.** A payload that passes
   the form rules but fails the database's last check (currently: missing email)
   gets `400 validation_failed` with `details.email`.
5. **`Cache-Control: no-store`** is on every API response.

### Full status table for `POST {CRM_URL}/api/crm/ingest`

| Status | `code` | Meaning | Consumer action |
|---|---|---|---|
| 200 | (none), `status: "ok"` | Recorded | Nothing |
| 200 | (none), `status: "dropped"` | Honeypot hit, deliberately not stored | Nothing |
| 400 | `invalid_json` | Body was not a JSON object | Bug in the consumer. Log as an error |
| 400 | `validation_failed` | Field rules drifted between the two validators | Log as an error with `details`. Fix the drift |
| 401 | `unauthorized` | Missing or wrong secret | Log as an error. Check `CRM_INGEST_SECRET` |
| 413 | `payload_too_large` | Over 64 KiB | Log as an error. Trim the metadata blobs |
| 415 | `unsupported_media_type` | Wrong Content-Type | Bug in the consumer. Send `application/json` |
| 429 | `rate_limited` | Per-secret limit (60/min by default). `Retry-After: 60` | Log a warning. **Do not retry in a loop** |
| 500 | `internal_error` | Problem on the CRM side | Log a warning with the `requestId` |

The server never returns raw database text, so do not parse `message`. Branch
on the HTTP status and `code`.

---

## Task

Update the CRM mirror helper (for example `lib/crmMirror.js`, or wherever
`mirrorToCrm` lives) so it does the following. **The visitor's experience must
not change**: the mirror stays non-blocking and non-fatal, and the visitor sees
the same success and error messages as today.

1. **Send a request id.** Generate one per submission with
   `crypto.randomUUID()`. If the site already has a request or trace id, reuse
   it. Send it as `x-request-id` and include it in every log line about that
   submission.
2. **Always send `Content-Type: application/json`** and a body built with
   `JSON.stringify` of a plain object.
3. **Classify the response by status and `code`**, using the table above. Log
   one structured line per call:
   ```js
   console[level](JSON.stringify({ event: "crm_mirror", form, status: res.status, code, requestId }));
   ```
   Use `error` for 400, 401, 413 and 415 (the consumer must fix something),
   `warn` for 429 and 5xx, and nothing or `info` for 200. **Never log** the
   secret, the email, the name, the message or the full payload. Field *names*
   from `details` are fine to log.
4. **Keep the timeout.** Use `AbortSignal.timeout(4000)`. A timeout counts as a
   `warn` with `code: "timeout"`.
5. **Run without holding the visitor's response.** On Vercel, use `after()` from
   `next/server` (Next.js 15.1 or later) or `waitUntil()` from
   `@vercel/functions`. Do not leave a floating promise; Fluid compute can drop
   it. Read anything you need from the request (body fields, geo) **before**
   scheduling the call.
6. **Do not retry.** The contract is at-most-once. Never retry after a 429. A
   missed lead can be recovered from the notification email.
7. **Cap the payload yourself.** Before sending, drop any metadata blob
   (`_attribution`, `_analytics`, `_engagement`, `_geo`) whose JSON is over
   16 KiB, and log a `warn`. This keeps the whole body far under the 64 KiB limit.
8. **Keep the secret on the server.** It must never be `NEXT_PUBLIC_*`, never be
   in a response, and never be in a log.

### Reference implementation

```js
// lib/crmMirror.js — server-only
const BLOB_KEYS = ["_attribution", "_analytics", "_engagement", "_geo"];
const MAX_BLOB_BYTES = 16 * 1024;

function capBlobs(payload, log) {
  const out = { ...payload };
  for (const key of BLOB_KEYS) {
    if (out[key] == null) continue;
    if (Buffer.byteLength(JSON.stringify(out[key]), "utf8") > MAX_BLOB_BYTES) {
      log("warn", { code: "blob_dropped", field: key });
      out[key] = null;
    }
  }
  return out;
}

const ERROR_CODES = new Set([400, 401, 413, 415]);

/**
 * Mirror a form submission into the Bughaw CRM.
 * Never throws, never retries. Schedule it with after()/waitUntil.
 */
export async function mirrorToCrm(form, payload, { requestId = crypto.randomUUID() } = {}) {
  const base = process.env.CRM_URL;
  const secret = process.env.CRM_INGEST_SECRET;
  if (!base || !secret) return;

  const log = (level, fields) =>
    console[level](JSON.stringify({ event: "crm_mirror", form, requestId, ...fields }));

  try {
    const res = await fetch(`${base}/api/crm/ingest`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bughaw-ingest-secret": secret,
        "x-request-id": requestId,
      },
      body: JSON.stringify({ form, ...capBlobs(payload, log) }),
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) return;

    const body = await res.json().catch(() => ({}));
    const fields = {
      status: res.status,
      code: body.code ?? "unknown",
      serverRequestId: body.requestId ?? res.headers.get("x-request-id"),
      ...(body.details ? { fields: Object.keys(body.details) } : {}),
    };
    log(ERROR_CODES.has(res.status) ? "error" : "warn", fields);
  } catch (err) {
    log("warn", { code: err?.name === "TimeoutError" ? "timeout" : "network_error" });
  }
}
```

Call site (Next.js App Router route handler), after the notification email is
sent:

```js
import { after } from "next/server";

const requestId = request.headers.get("x-vercel-id") ?? crypto.randomUUID();
const crmPayload = {
  fullName, email, hotelName, starRating, roomCount, interests, source, message,
  website_field_hp: body.website_field_hp ?? "",
  _attribution: body._attribution ?? null,
  _analytics: body._analytics ?? null,
  _engagement: body._engagement ?? null,
  _geo: geo ?? null,
};
after(() => mirrorToCrm("for_hotels", crmPayload, { requestId }));
return NextResponse.json(/* the existing success response, unchanged */);
```

`x-vercel-id` contains only characters the CRM accepts and is long enough, so
it passes through as the shared id. In a Pages Router API route, use
`waitUntil(mirrorToCrm(...))` from `@vercel/functions` instead of `after`.

---

## Apply the same practices to your own endpoints

The marketing site's `/api/contact`, `/api/for-hotels` and `/api/inquiry` should
follow the same rules. Do not change their **visitor-facing messages or response
fields**. Adding fields is fine.

- Reject non-JSON bodies with 415 and bodies over a sensible cap (such as 64 KiB)
  with 413, before doing any work.
- Return `Cache-Control: no-store` and an `X-Request-Id` header.
- Never return raw exception or upstream text to the visitor. Log it with the
  request id instead.
- Log one JSON line per request, with ids and codes and no personal data.
- Set `export const maxDuration = 10` (or a similar small cap) and keep
  `runtime = "nodejs"`. Do not switch to Edge.

## Definition of done

- [ ] Every CRM call sends `content-type: application/json` and `x-request-id`.
- [ ] The mirror is scheduled with `after()` or `waitUntil()` and is not awaited
      in the visitor's response path. There are no floating promises.
- [ ] Each outcome in the status table produces the documented log level, with
      `requestId` and no personal data. Check with a wrong secret (401), a body
      sent as `text/plain` (415) and a normal submission (no log, or `info`).
- [ ] An oversized `_engagement` blob is dropped with a `warn`, and the lead is
      still recorded.
- [ ] Nothing retries. A 429 is logged once.
- [ ] With `CRM_URL` or `CRM_INGEST_SECRET` unset, the forms work exactly as
      before.
- [ ] `grep -r "CRM_INGEST_SECRET" .next/static` finds nothing.
- [ ] Lint, tests and build pass.

## Do not

- Do not parse or match on `message` strings. Use the status and `code`.
- Do not send cookies, raw headers or session tokens to the CRM.
- Do not add CORS or call the CRM from the browser. The call is server to
  server only.
- Do not change the field names the CRM expects (see the integration prompt).
