// Response security headers, shared by next.config.js (which can only `require`
// plain JS — hence CommonJS here, not TypeScript).
//
// Production uses an https Supabase URL, and for that the output is fixed: the
// exact header set below. Only when NEXT_PUBLIC_SUPABASE_URL is plain http
// (the local Supabase stack used by the E2E suite, docs/ui-testing.md) does the
// CSP allow that origin in connect-src and drop upgrade-insecure-requests and
// HSTS, which would otherwise rewrite or block requests to http://127.0.0.1.

/** @param {string | undefined} supabaseUrl */
function insecureSupabaseOrigin(supabaseUrl) {
  if (!supabaseUrl) return null;
  try {
    const url = new URL(supabaseUrl);
    return url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}

/**
 * @param {string | undefined} supabaseUrl
 * @returns {{ key: string, value: string }[]}
 */
function buildSecurityHeaders(supabaseUrl) {
  const localOrigin = insecureSupabaseOrigin(supabaseUrl);

  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https:",
    "font-src 'self' https://fonts.gstatic.com data:",
    localOrigin ? `connect-src 'self' https: ${localOrigin}` : "connect-src 'self' https:",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ];
  if (!localOrigin) csp.push("upgrade-insecure-requests");

  const headers = [
    { key: "X-DNS-Prefetch-Control", value: "off" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), interest-cohort=()",
    },
  ];
  if (!localOrigin) {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    });
  }
  headers.push(
    { key: "X-XSS-Protection", value: "1; mode=block" },
    { key: "Content-Security-Policy", value: csp.join("; ") },
  );
  return headers;
}

module.exports = { buildSecurityHeaders, insecureSupabaseOrigin };
