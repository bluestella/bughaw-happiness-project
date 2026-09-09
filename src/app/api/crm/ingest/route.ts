import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isHoneypotHit, isSubmissionForm, validateSubmission, type SubmissionBody } from "@/lib/crm";

// Mirror of the marketing-site form endpoints documented in FORMS_AUDIT.md §8.
// Authorisation is a shared secret verified inside Postgres by
// public.ingest_form_submission — this app never holds a service-role key.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SECRET_HEADER = "x-bughaw-ingest-secret";

// Audit §2/§3/§4 — the success strings the site already shows submitters.
const SUCCESS_MESSAGE: Record<string, string> = {
  contact: "Your message is in. We'll respond within 3 business days.",
  for_hotels: "Thank you. We'll reply within 2 business days with next steps.",
  inquiry: "Inquiry submitted successfully!",
};

export async function POST(request: Request) {
  const secret = request.headers.get(SECRET_HEADER) ?? "";
  if (secret === "") {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  let body: SubmissionBody;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("not an object");
    }
    body = parsed as SubmissionBody;
  } catch {
    return NextResponse.json({ message: "Invalid JSON body." }, { status: 400 });
  }

  const form = body.form;
  if (!isSubmissionForm(form)) {
    return NextResponse.json(
      { message: "Validation failed.", details: { form: "Unknown form. Expected contact, for_hotels or inquiry." } },
      { status: 400 }
    );
  }

  // Honeypot hits skip validation entirely (audit §5.1): a bot must not be able
  // to tell a dropped submission from an accepted one.
  if (!isHoneypotHit(body)) {
    const result = validateSubmission(form, body);
    if (!result.ok) {
      return NextResponse.json(
        { message: "Validation failed.", details: result.details },
        { status: 400 }
      );
    }
  }

  let data: unknown;
  let error: { message: string } | null;
  try {
    const supabase = createClient();
    ({ data, error } = await supabase.rpc("ingest_form_submission", {
      p_secret: secret,
      p_payload: body,
    }));
  } catch (err) {
    console.error("[crm/ingest] client error", err);
    return NextResponse.json({ message: "Could not record the submission." }, { status: 500 });
  }

  if (error) {
    if (error.message.includes("unauthorized")) {
      return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
    }
    // Log for us, stay sanitised for the caller (audit §8.1).
    console.error("[crm/ingest] rpc error", error.message);
    return NextResponse.json({ message: "Could not record the submission." }, { status: 500 });
  }

  const status =
    data && typeof data === "object" && "status" in data
      ? String((data as Record<string, unknown>).status)
      : "ok";

  return NextResponse.json({ message: SUCCESS_MESSAGE[form], status }, { status: 200 });
}
