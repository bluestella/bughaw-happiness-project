import { afterEach, describe, expect, it, vi } from "vitest";
import {
  API_ERROR_CODES,
  STATUS_FOR_CODE,
  apiEmpty,
  apiError,
  apiJson,
  getRequestId,
  isSameOrigin,
  logApi,
  readJsonObject,
} from "@/lib/api/http";
import { safeRedirectPath } from "@/lib/api/redirect";

const req = (headers: Record<string, string> = {}, body?: string) =>
  new Request("https://suite.test/api/x", { method: "POST", headers, body });

describe("getRequestId", () => {
  it("echoes a safe caller id", () => {
    expect(getRequestId(req({ "x-request-id": "abc-12345" }))).toBe("abc-12345");
  });
  it("falls back to x-vercel-id", () => {
    expect(getRequestId(req({ "x-vercel-id": "sin1::abcd-1234" }))).toBe("sin1::abcd-1234");
  });
  it("refuses unsafe or short ids and generates a UUID", () => {
    const id = getRequestId(req({ "x-request-id": "bad id\twith spaces", "x-vercel-id": "short" }));
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(getRequestId(req({ "x-request-id": "a".repeat(129) }))).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("responses", () => {
  it("apiJson adds requestId, no-store and X-Request-Id", async () => {
    const res = apiJson({ ok: 1 }, { requestId: "rid-0001", headers: { "X-Extra": "y" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-request-id")).toBe("rid-0001");
    expect(res.headers.get("x-extra")).toBe("y");
    expect(await res.json()).toEqual({ ok: 1, requestId: "rid-0001" });
  });
  it("apiError uses the default status for the code and includes details only when given", async () => {
    const a = apiError("rate_limited", "Slow down.", { requestId: "rid-0002", headers: { "Retry-After": "60" } });
    expect(a.status).toBe(429);
    expect(a.headers.get("retry-after")).toBe("60");
    expect(await a.json()).toEqual({ message: "Slow down.", code: "rate_limited", requestId: "rid-0002" });

    const b = apiError("validation_failed", "Validation failed.", {
      requestId: "rid-0003",
      details: { email: "bad" },
      status: 422,
    });
    expect(b.status).toBe(422);
    expect(await b.json()).toEqual({
      message: "Validation failed.",
      code: "validation_failed",
      requestId: "rid-0003",
      details: { email: "bad" },
    });
  });
  it("every code has a 4xx/5xx status", () => {
    for (const code of API_ERROR_CODES) expect(STATUS_FOR_CODE[code]).toBeGreaterThanOrEqual(400);
  });
  it("apiEmpty is 204 with standard headers, or a given status", () => {
    const res = apiEmpty({ requestId: "rid-0004" });
    expect(res.status).toBe(204);
    expect(res.headers.get("x-request-id")).toBe("rid-0004");
    expect(apiEmpty({ requestId: "rid-0004", status: 202 }).status).toBe(202);
  });
});

describe("readJsonObject", () => {
  const json = { "content-type": "application/json; charset=utf-8" };

  it("reads a JSON object", async () => {
    expect(await readJsonObject(req(json, '{"a":1}'), { maxBytes: 100 })).toEqual({ ok: true, value: { a: 1 } });
  });
  it("415 without a JSON content type unless relaxed", async () => {
    expect(await readJsonObject(req({ "content-type": "text/plain" }, "{}"), { maxBytes: 100 })).toMatchObject({
      ok: false,
      code: "unsupported_media_type",
    });
    expect(await readJsonObject(req({}, "{}"), { maxBytes: 100 })).toMatchObject({ code: "unsupported_media_type" });
    expect(await readJsonObject(req({ "content-type": "application/jsonx" }, "{}"), { maxBytes: 100 })).toMatchObject({
      code: "unsupported_media_type",
    });
    expect(
      await readJsonObject(req({ "content-type": "text/plain" }, '{"a":2}'), { maxBytes: 100, requireJsonContentType: false })
    ).toEqual({ ok: true, value: { a: 2 } });
  });
  it("413 on declared or actual size over the cap (bytes, not characters)", async () => {
    expect(await readJsonObject(req({ ...json, "content-length": "500" }, "{}"), { maxBytes: 100 })).toMatchObject({
      code: "payload_too_large",
    });
    // 30 × "é" = 60 bytes + quotes/braces; under 40 characters but over 40 bytes.
    const body = JSON.stringify({ a: "é".repeat(30) });
    expect(body.length).toBeLessThan(45);
    expect(await readJsonObject(req(json, body), { maxBytes: 45 })).toMatchObject({ code: "payload_too_large" });
  });
  it("400 on bad JSON or a non-object top level", async () => {
    expect(await readJsonObject(req(json, "{nope"), { maxBytes: 100 })).toMatchObject({ code: "invalid_json" });
    expect(await readJsonObject(req(json, "[1]"), { maxBytes: 100 })).toMatchObject({ code: "invalid_json" });
    expect(await readJsonObject(req(json, "null"), { maxBytes: 100 })).toMatchObject({ code: "invalid_json" });
    expect(await readJsonObject(req(json, '"str"'), { maxBytes: 100 })).toMatchObject({ code: "invalid_json" });
  });
  it("400 when the body cannot be read", async () => {
    const broken = req(json, "{}");
    await broken.text(); // body already consumed → text() rejects
    expect(await readJsonObject(broken, { maxBytes: 100 })).toMatchObject({ code: "invalid_json" });
  });
});

describe("isSameOrigin", () => {
  it("allows requests with no Origin", () => {
    expect(isSameOrigin(req({ host: "suite.test" }))).toBe(true);
  });
  it("matches Origin host against Host / X-Forwarded-Host", () => {
    expect(isSameOrigin(req({ origin: "https://suite.test", host: "suite.test" }))).toBe(true);
    expect(isSameOrigin(req({ origin: "https://suite.test", host: "internal", "x-forwarded-host": "suite.test" }))).toBe(true);
    expect(isSameOrigin(req({ origin: "https://evil.test", host: "suite.test" }))).toBe(false);
  });
  it("refuses a malformed Origin or a missing Host", () => {
    expect(isSameOrigin(req({ origin: "not a url", host: "suite.test" }))).toBe(false);
    const noHost = new Request("https://suite.test/x", { headers: { origin: "https://suite.test" } });
    // undici does not set Host on a constructed Request.
    expect(isSameOrigin(noHost)).toBe(false);
  });
});

describe("logApi", () => {
  afterEach(() => vi.restoreAllMocks());
  it("writes one JSON line at the right level", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    logApi("info", "e.one", { requestId: "r" });
    logApi("warn", "e.two");
    logApi("error", "e.three", { code: 1 });
    expect(JSON.parse(info.mock.calls[0][0] as string)).toEqual({ level: "info", event: "e.one", requestId: "r" });
    expect(JSON.parse(warn.mock.calls[0][0] as string)).toEqual({ level: "warn", event: "e.two" });
    expect(JSON.parse(error.mock.calls[0][0] as string)).toEqual({ level: "error", event: "e.three", code: 1 });
  });
});

describe("safeRedirectPath", () => {
  it.each([
    ["/crm", "/crm"],
    ["/tasks/1?tab=a", "/tasks/1?tab=a"],
    [null, "/"],
    [undefined, "/"],
    ["", "/"],
    ["crm", "/"],
    ["//evil.test", "/"],
    ["/\\evil.test", "/"],
    ["/x?u=https://evil.test", "/"],
    ["/a\nb", "/"],
    ["/a\rb", "/"],
    ["/%2F%2Fevil.test", "/"],
    ["/%2Fevil.test", "/"],
    ["/%5Cevil.test", "/"],
    ["/x%0aSet-Cookie:1", "/"],
    ["/bad%E0%A4%A", "/"],
  ])("%s → %s", (input, expected) => {
    expect(safeRedirectPath(input as string | null | undefined)).toBe(expected);
  });
});
