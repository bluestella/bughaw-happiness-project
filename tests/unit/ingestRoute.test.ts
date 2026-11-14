import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The route's only collaborator is the Supabase RPC; everything else is real.
const rpc = vi.fn();
const createClient = vi.fn(async () => ({ rpc }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => createClient() }));

const { POST } = await import("@/app/api/crm/ingest/route");

const CONTACT = {
  form: "contact",
  name: "Ana Cruz",
  email: "ana@hotel.test",
  company: "Hotel Test",
  role: "Purchasing",
  message: "We would like samples please.",
  website_field_hp: "",
};

function post(body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new Request("https://suite.test/api/crm/ingest", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bughaw-ingest-secret": "s3cret",
        "x-request-id": "consumer-req-1",
        ...headers,
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );
}

beforeEach(() => {
  rpc.mockReset();
  createClient.mockClear();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("POST /api/crm/ingest", () => {
  it("records a valid submission and echoes the request id", async () => {
    rpc.mockResolvedValue({ data: { status: "ok" }, error: null });
    const res = await post(CONTACT);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toBe("consumer-req-1");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({
      message: "Your message is in. We'll respond within 3 business days.",
      status: "ok",
      requestId: "consumer-req-1",
    });
    expect(rpc).toHaveBeenCalledWith("ingest_form_submission", { p_secret: "s3cret", p_payload: CONTACT });
  });

  it("defaults status to ok when the RPC returns no status", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await (await post(CONTACT)).json()).toMatchObject({ status: "ok" });
  });

  it("passes honeypot hits through without validating (dropped by the DB)", async () => {
    rpc.mockResolvedValue({ data: { status: "dropped" }, error: null });
    const res = await post({ form: "inquiry", website_field_hp: "bot" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "dropped" });
  });

  it("401 without a secret, or with an oversized one, before touching the DB", async () => {
    for (const secret of ["", "x".repeat(257)]) {
      const res = await post(CONTACT, { "x-bughaw-ingest-secret": secret });
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({ code: "unauthorized", message: "Unauthorized." });
    }
    expect(createClient).not.toHaveBeenCalled();
  });

  it("415 / 413 / 400 for the wrong content type, a huge body, or bad JSON", async () => {
    expect((await post(CONTACT, { "content-type": "text/plain" })).status).toBe(415);
    const huge = await post({ ...CONTACT, message: "x".repeat(70 * 1024) });
    expect(huge.status).toBe(413);
    expect(await huge.json()).toMatchObject({ code: "payload_too_large" });
    const bad = await post("{not json");
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ code: "invalid_json", message: "Invalid JSON body." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("400 for an unknown form or failed validation, with field details", async () => {
    const unknown = await post({ ...CONTACT, form: "newsletter" });
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toMatchObject({ code: "validation_failed", details: { form: expect.any(String) } });

    const invalid = await post({ ...CONTACT, email: "nope" });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({
      code: "validation_failed",
      message: "Validation failed.",
      details: { email: "Enter a valid email address." },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps Postgres errcodes to the public contract", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "28000", message: "unauthorized" } });
    expect((await post(CONTACT)).status).toBe(401);

    rpc.mockResolvedValueOnce({ data: null, error: { code: "54000", message: "rate limit exceeded" } });
    const limited = await post(CONTACT);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    expect(await limited.json()).toMatchObject({ code: "rate_limited" });

    rpc.mockResolvedValueOnce({ data: null, error: { code: "22023", message: "email is required" } });
    const db400 = await post(CONTACT);
    expect(db400.status).toBe(400);
    expect(await db400.json()).toMatchObject({ details: { email: "Email is required." } });
  });

  it("still recognises the old error text when no errcode is present", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "unauthorized" } });
    expect((await post(CONTACT)).status).toBe(401);
    rpc.mockResolvedValueOnce({ data: null, error: { message: "rate limit exceeded" } });
    expect((await post(CONTACT)).status).toBe(429);
  });

  it("500 with a sanitised body for any other DB error or a thrown client", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "22023", message: "invalid input for secret_value=abc" } });
    const res = await post(CONTACT);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ message: "Could not record the submission.", code: "internal_error", requestId: "consumer-req-1" });

    rpc.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect((await post(CONTACT)).status).toBe(500);
  });

  it("generates a request id when the caller sends none", async () => {
    rpc.mockResolvedValue({ data: { status: "ok" }, error: null });
    const res = await post(CONTACT, { "x-request-id": "" });
    expect(res.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
  });
});
