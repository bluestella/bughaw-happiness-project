// Shared building blocks for every route handler (src/app/**/route.ts).
// Pure, framework-light (standard Request/Response only) and unit-tested, so
// each route stays a short list of steps: identify → authenticate → read →
// validate → act → respond. See docs/api.md for the rules these implement.

/** Machine-readable error codes. Callers branch on `code`, never on `message`. */
export const API_ERROR_CODES = [
  "unauthorized",
  "forbidden",
  "not_found",
  "unsupported_media_type",
  "payload_too_large",
  "invalid_json",
  "validation_failed",
  "rate_limited",
  "internal_error",
  "service_unavailable",
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** Default HTTP status for each error code. */
export const STATUS_FOR_CODE: Record<ApiErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  unsupported_media_type: 415,
  payload_too_large: 413,
  invalid_json: 400,
  validation_failed: 400,
  rate_limited: 429,
  internal_error: 500,
  service_unavailable: 503,
};

export const REQUEST_ID_HEADER = "x-request-id";

// A caller-supplied id is echoed only if it is short and plain, so it can never
// inject into a log line or a response header.
const SAFE_ID = /^[A-Za-z0-9._:-]{8,128}$/;

/**
 * Correlation id for one request: the caller's `x-request-id` if it is safe,
 * else Vercel's `x-vercel-id`, else a fresh UUID. Returned on every response and
 * written on every log line, so a consumer's log can be matched to ours.
 */
export function getRequestId(request: Request): string {
  for (const name of [REQUEST_ID_HEADER, "x-vercel-id"]) {
    const value = request.headers.get(name);
    if (value && SAFE_ID.test(value)) return value;
  }
  return crypto.randomUUID();
}

type ResponseOptions = {
  status?: number;
  requestId: string;
  headers?: Record<string, string>;
};

function baseHeaders(requestId: string, extra?: Record<string, string>): Headers {
  const headers = new Headers(extra);
  // API answers are per-request and may carry submitter data: never cache them.
  headers.set("Cache-Control", "no-store");
  headers.set("X-Request-Id", requestId);
  return headers;
}

/** JSON success response with the standard headers and `requestId` in the body. */
export function apiJson(body: Record<string, unknown>, opts: ResponseOptions): Response {
  return Response.json(
    { ...body, requestId: opts.requestId },
    { status: opts.status ?? 200, headers: baseHeaders(opts.requestId, opts.headers) }
  );
}

/**
 * The one error shape: `{ message, code, requestId, details? }`.
 * `message` is human-readable and stable but not for branching; `code` is.
 * Never put internal error text, stack traces or SQL in here.
 */
export function apiError(
  code: ApiErrorCode,
  message: string,
  opts: Omit<ResponseOptions, "status"> & { status?: number; details?: Record<string, string> }
): Response {
  const body: Record<string, unknown> = { message, code };
  if (opts.details) body.details = opts.details;
  return apiJson(body, {
    status: opts.status ?? STATUS_FOR_CODE[code],
    requestId: opts.requestId,
    headers: opts.headers,
  });
}

/** Empty response (204 by default) that still carries the standard headers. */
export function apiEmpty(opts: ResponseOptions): Response {
  return new Response(null, {
    status: opts.status ?? 204,
    headers: baseHeaders(opts.requestId, opts.headers),
  });
}

export type BodyResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; code: ApiErrorCode; message: string };

/**
 * Read a request body as a JSON object with a hard size cap.
 * Checks, in order: Content-Type (415), declared Content-Length (413), actual
 * byte length (413), JSON syntax (400), and that the top level is an object (400).
 */
export async function readJsonObject(
  request: Request,
  opts: { maxBytes: number; requireJsonContentType?: boolean }
): Promise<BodyResult> {
  if (opts.requireJsonContentType !== false) {
    const type = (request.headers.get("content-type") ?? "").toLowerCase();
    if (!/^application\/json\s*(;|$)/.test(type)) {
      return { ok: false, code: "unsupported_media_type", message: "Content-Type must be application/json." };
    }
  }

  const tooLarge: BodyResult = { ok: false, code: "payload_too_large", message: "Request body is too large." };
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > opts.maxBytes) return tooLarge;

  let text: string;
  try {
    text = await request.text();
  } catch {
    return { ok: false, code: "invalid_json", message: "Invalid JSON body." };
  }
  if (new TextEncoder().encode(text).byteLength > opts.maxBytes) return tooLarge;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, code: "invalid_json", message: "Invalid JSON body." };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, code: "invalid_json", message: "Body must be a JSON object." };
  }
  return { ok: true, value: parsed as Record<string, unknown> };
}

/**
 * CSRF guard for cookie- or browser-initiated POSTs: true when the request has
 * no Origin (same-origin navigations and non-browser clients) or its Origin's
 * host matches the Host the browser used. Compare against the Host header:
 * inside Next, request.url's host is not necessarily the one the browser used.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

type LogLevel = "info" | "warn" | "error";

/**
 * One JSON line per event, so Vercel's log search can filter on any field.
 * Pass ids, statuses and codes only: never secrets, emails, names or bodies.
 */
export function logApi(level: LogLevel, event: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ level, event, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}
