import { createClient } from "@/lib/supabase/server";
import { isHoneypotHit, isSubmissionForm, validateSubmission } from "@/lib/crm";
import { apiError, apiJson, getRequestId, logApi, readJsonObject } from "@/lib/api/http";

// Mirror of the marketing-site form endpoints documented in FORMS_AUDIT.md §8.
// Authorisation is a shared secret verified inside Postgres by
// public.ingest_form_submission (hash compare + per-secret rate limit, 0021) —
// this app never holds a service-role key. Contract: docs/api.md.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// One RPC round trip. Fail fast instead of holding a Vercel Function open.
export const maxDuration = 10;

const SECRET_HEADER = "x-bughaw-ingest-secret";
/** Form text plus the analytics blobs fit comfortably; anything bigger is abuse. */
const MAX_BODY_BYTES = 64 * 1024;
/** Real secrets are well under this; a longer header is refused before any DB work. */
const MAX_SECRET_LENGTH = 256;

// Audit §2/§3/§4 — the success strings the site already shows submitters.
const SUCCESS_MESSAGE: Record<string, string> = {
  contact: "Your message is in. We'll respond within 3 business days.",
  for_hotels: "Thank you. We'll reply within 2 business days with next steps.",
  inquiry: "Inquiry submitted successfully!",
};

// Postgres errcodes raised by ingest_form_submission (0021).
const PG_UNAUTHORIZED = "28000";
const PG_RATE_LIMITED = "54000";
const PG_INVALID_PARAM = "22023";

type RpcError = { message: string; code?: string };

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const route = "crm.ingest";

  // 1. Authenticate (cheap checks only; the real compare happens in Postgres).
  const secret = request.headers.get(SECRET_HEADER) ?? "";
  if (secret === "" || secret.length > MAX_SECRET_LENGTH) {
    logApi("warn", "api.unauthorized", { route, requestId, reason: "missing_or_oversized_secret" });
    return apiError("unauthorized", "Unauthorized.", { requestId });
  }

  // 2. Read the body: JSON object, size-capped.
  const read = await readJsonObject(request, { maxBytes: MAX_BODY_BYTES });
  if (!read.ok) {
    logApi("warn", "api.bad_request", { route, requestId, code: read.code });
    return apiError(read.code, read.message, { requestId });
  }
  const body = read.value;

  // 3. Validate.
  const form = body.form;
  if (!isSubmissionForm(form)) {
    return apiError("validation_failed", "Validation failed.", {
      requestId,
      details: { form: "Unknown form. Expected contact, for_hotels or inquiry." },
    });
  }
  // Honeypot hits skip validation entirely (audit §5.1): a bot must not be able
  // to tell a dropped submission from an accepted one.
  if (!isHoneypotHit(body)) {
    const result = validateSubmission(form, body);
    if (!result.ok) {
      logApi("warn", "api.validation_failed", { route, requestId, form, fields: Object.keys(result.details) });
      return apiError("validation_failed", "Validation failed.", { requestId, details: result.details });
    }
  }

  // 4. Act.
  let data: unknown;
  let error: RpcError | null;
  try {
    const supabase = await createClient();
    ({ data, error } = await supabase.rpc("ingest_form_submission", {
      p_secret: secret,
      p_payload: body,
    }));
  } catch (err) {
    logApi("error", "api.upstream_error", { route, requestId, error: errorName(err) });
    return apiError("internal_error", "Could not record the submission.", { requestId });
  }

  if (error) return rpcErrorResponse(error, requestId, form);

  // 5. Respond.
  const status =
    data && typeof data === "object" && "status" in data
      ? String((data as Record<string, unknown>).status)
      : "ok";
  logApi("info", "api.ok", { route, requestId, form, status });
  return apiJson({ message: SUCCESS_MESSAGE[form], status }, { requestId });
}

/** Map a Postgres error to the public contract. Branch on errcode, not text. */
function rpcErrorResponse(error: RpcError, requestId: string, form: string): Response {
  const route = "crm.ingest";
  if (error.code === PG_UNAUTHORIZED || error.message.includes("unauthorized")) {
    logApi("warn", "api.unauthorized", { route, requestId, reason: "secret_rejected" });
    return apiError("unauthorized", "Unauthorized.", { requestId });
  }
  if (error.code === PG_RATE_LIMITED || error.message.includes("rate limit")) {
    logApi("warn", "api.rate_limited", { route, requestId });
    return apiError("rate_limited", "Too many submissions. Try again in a minute.", {
      requestId,
      headers: { "Retry-After": "60" },
    });
  }
  if (error.code === PG_INVALID_PARAM && error.message === "email is required") {
    // The database's own last-line check. Answer with a fixed string, never the
    // raw database text (a different 22023 could carry data in its message).
    logApi("warn", "api.validation_failed", { route, requestId, form, source: "db" });
    return apiError("validation_failed", "Validation failed.", {
      requestId,
      details: { email: "Email is required." },
    });
  }
  // Log for us, stay sanitised for the caller (audit §8.1).
  logApi("error", "api.upstream_error", { route, requestId, pgCode: error.code ?? null, error: error.message });
  return apiError("internal_error", "Could not record the submission.", { requestId });
}

function errorName(err: unknown): string {
  return err instanceof Error ? err.name : "unknown";
}
