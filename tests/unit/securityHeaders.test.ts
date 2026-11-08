import { describe, expect, it } from "vitest";
import { buildSecurityHeaders, insecureSupabaseOrigin } from "@/lib/securityHeaders.js";

// The exact header list next.config.js shipped before the helper existed.
// Production (https Supabase) must keep producing it byte for byte.
const PRODUCTION_HEADERS = [
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), interest-cohort=()",
  },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  {
    key: "Content-Security-Policy",
    value:
      "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "img-src 'self' data: blob: https:; font-src 'self' https://fonts.gstatic.com data:; " +
      "connect-src 'self' https:; frame-src 'none'; frame-ancestors 'none'; " +
      "base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests",
  },
];

const csp = (headers: { key: string; value: string }[]) =>
  headers.find((h) => h.key === "Content-Security-Policy")?.value ?? "";

describe("buildSecurityHeaders", () => {
  it("is unchanged for an https Supabase URL (production)", () => {
    expect(buildSecurityHeaders("https://abc.supabase.co")).toEqual(PRODUCTION_HEADERS);
  });

  it("falls back to the production set when the URL is missing or malformed", () => {
    expect(buildSecurityHeaders(undefined)).toEqual(PRODUCTION_HEADERS);
    expect(buildSecurityHeaders("")).toEqual(PRODUCTION_HEADERS);
    expect(buildSecurityHeaders("not a url")).toEqual(PRODUCTION_HEADERS);
  });

  it("allows a local http Supabase origin and drops the https-forcing headers", () => {
    const headers = buildSecurityHeaders("http://127.0.0.1:55421");
    const policy = csp(headers);
    expect(policy).toContain("connect-src 'self' https: http://127.0.0.1:55421;");
    expect(policy).not.toContain("upgrade-insecure-requests");
    expect(headers.some((h) => h.key === "Strict-Transport-Security")).toBe(false);
    // Everything else stays strict.
    expect(policy).toContain("frame-ancestors 'none'");
    expect(headers).toContainEqual({ key: "X-Frame-Options", value: "DENY" });
    expect(headers).toContainEqual({ key: "X-Content-Type-Options", value: "nosniff" });
  });

  it("uses the origin only, never the path", () => {
    expect(csp(buildSecurityHeaders("http://localhost:55421/rest/v1"))).toContain(
      "connect-src 'self' https: http://localhost:55421;"
    );
  });
});

describe("insecureSupabaseOrigin", () => {
  it("returns the origin only for http URLs", () => {
    expect(insecureSupabaseOrigin("http://127.0.0.1:55421")).toBe("http://127.0.0.1:55421");
    expect(insecureSupabaseOrigin("https://abc.supabase.co")).toBeNull();
    expect(insecureSupabaseOrigin(undefined)).toBeNull();
    expect(insecureSupabaseOrigin("::bad::")).toBeNull();
  });
});
