# API standard: route handlers

Rules for every `src/app/**/route.ts`. The helpers live in
[`src/lib/api/http.ts`](../src/lib/api/http.ts) and
[`src/lib/api/redirect.ts`](../src/lib/api/redirect.ts) and are unit-tested
(`tests/unit/apiHttp.test.ts`, coverage-gated). Consumer-facing changes are in
[api-consumer-update-prompt.md](api-consumer-update-prompt.md).

## 1. Endpoints today

| Route | Method | Caller | Auth | Notes |
|---|---|---|---|---|
| `/api/crm/ingest` | POST | Marketing site (server to server) | `x-bughaw-ingest-secret`, hashed and compared in Postgres (0021) | JSON contract below |
| `/auth/callback` | GET | Supabase OAuth | OAuth code | `next` passes through `safeRedirectPath` |
| `/auth/signout` | POST | App form | Session cookie, same-origin check | 303 to `/login` |
| `/c/<token>/event` | POST | Card page beacon | None (public), same-origin | Always 204 |
| `/c/<token>/vcard` | GET | Public | None | vCard file |
| `/c/<token>/wallet/{apple,google}` | GET | Public | None | 404 until wallet env vars exist |

## 2. Rules

**Shape of a handler.** Each handler follows the same steps: request id →
authenticate → read body → validate → act → respond. Keep business rules in
`src/lib/*.ts` (pure, tested). The route only wires them together.

**Errors have one shape.**
```json
{ "message": "Human text", "code": "validation_failed", "requestId": "…", "details": { "field": "reason" } }
```
- `code` comes from `API_ERROR_CODES`. Callers branch on `code` and the HTTP
  status, never on `message`.
- `message` is fixed text. Never put raw database, upstream or exception text in
  a response. Log it instead.
- `details` appears only for `validation_failed`, keyed by field name.
- Success bodies also carry `requestId`.

| Code | Status |
|---|---|
| `unauthorized` | 401 |
| `forbidden` | 403 |
| `not_found` | 404 |
| `invalid_json` / `validation_failed` | 400 |
| `payload_too_large` | 413 |
| `unsupported_media_type` | 415 |
| `rate_limited` | 429 + `Retry-After` |
| `internal_error` | 500 |
| `service_unavailable` | 503 |

**Every response** carries `Cache-Control: no-store` and `X-Request-Id`, and the
global security headers from `next.config.js` and `proxy.ts`. Build JSON responses
with `apiJson`, `apiError` and `apiEmpty`, not raw `NextResponse.json`.

**Request ids.** `getRequestId` echoes a caller's `x-request-id` when it matches
`[A-Za-z0-9._:-]{8,128}`. Otherwise it uses `x-vercel-id`, and failing that a
new UUID. The id goes on every log line, so a consumer's log line can be
matched to ours.

**Reading bodies.** Use `readJsonObject(request, { maxBytes })`. It checks the
Content-Type (415), the declared and actual byte size (413), the JSON syntax and
that the top level is an object (400). Pick a `maxBytes` per route: 64 KiB for
ingest, 512 B for the card beacon.

**Authentication.**
- Secrets are compared in Postgres (hash, constant time), never in JS. The route
  only refuses empty or oversized headers before any DB work.
- Map database errors by **errcode** (`28000` unauthorized, `54000` rate
  limited), not by message text. Keep a message-text fallback only while the
  errcode is new.
- Browser-initiated POSTs that act on a cookie (signout) or record data (beacon)
  must pass `isSameOrigin`.
- Never add a service-role key. RLS and security-definer RPCs are the boundary
  (AGENTS.md §4.1).

**Redirects.** Run any user-supplied path through `safeRedirectPath`. It also
refuses malformed percent-encoding, which used to throw a 500.

**Logging.** Use `logApi(level, event, fields)`, which writes one JSON line per
event. Log ids, codes, statuses, form names and field *names*. Never log secrets,
emails, names, message bodies or full payloads.

**Side work after the response.** Analytics and other best-effort writes go in
`after()` from `next/server`. They must not delay the response. Read any request
data (user agent) *before* calling `after()`.

**Route segment config.** Every handler sets `runtime = "nodejs"`,
`dynamic = "force-dynamic"` and a small `maxDuration` (10 s today). Only
HTTP-method functions and segment config may be exported from a `route.ts`,
because the Next build rejects anything else. Put constants that need testing in
`src/lib`.

**CORS.** None. Ingest is server to server and the rest are same-origin. Do not
add `Access-Control-Allow-Origin` without a security review.

**Versioning.** Paths are unversioned. Changes must be **additive** (new fields,
new optional inputs). A breaking change needs a new path (`/api/v2/...`) running
alongside the old one until every consumer has moved.

**Tests.** Each route gets a unit test that mocks only `@/lib/supabase/server`
(see `tests/unit/ingestRoute.test.ts`). Cover every status code it can return.
Real RLS behavior is covered by `npm run test:access`.

## 3. Vercel Functions

**These routes are already Vercel Functions.** On Vercel, every Next.js App
Router route handler is built and deployed as a Vercel Function on the Node.js
runtime with Fluid compute, which is the default. There is nothing to migrate.
A separate root `api/` folder does not apply in a Next.js project and would
split auth, helpers and tests in two.

What this repo uses from the platform:

| Feature | How |
|---|---|
| Node.js runtime, not Edge | `export const runtime = "nodejs"`. Edge is deprecated in Next 16 and not needed for Supabase calls |
| Execution cap | `export const maxDuration = 10` per route, so a stuck upstream call fails fast |
| Work after the response | `after()` from `next/server`, backed by Vercel's `waitUntil` |
| Log correlation | `x-vercel-id` as the fallback request id. Logs are JSON lines, searchable in Vercel Logs |
| Instance reuse | Fluid compute reuses warm instances. Keep module scope free of per-request state |

Recommended platform settings. These are owner decisions and not in code:
- **Function region**: set it in Project Settings → Functions to the region
  nearest the Supabase project. Each ingest call is one DB round trip, so this
  is the largest latency factor.
- **Vercel Firewall rule**: rate-limit `/api/crm/ingest` and `/c/*/event` per
  IP, as a layer in front of the per-secret DB limit. Check that your plan
  includes it.
- **Log drain or alert** on `event = "api.unauthorized"` spikes. This is the
  open "alert on repeated failed ingest auth" item in docs/security.md.
