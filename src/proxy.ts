import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/middleware";
import { landingPath, routeRedirect } from "@/lib/access";
import { getCurrentUserAccess } from "@/utils/supabase/access";

// /api/crm/ingest authenticates with a shared secret checked inside Postgres,
// not with a user session — see supabase/migrations/0003_crm.sql.
// /c/<token> is the public digital business card. It can only reach the
// get_public_card / record_card_event RPCs (0009_digital_cards.sql).
const PUBLIC_EXACT = ["/login", "/api/crm/ingest"] as const;
const PUBLIC_PREFIXES = ["/auth/", "/c/"] as const;
const PUBLIC_CARD_PREFIX = "/c/";

function matchesPublic(pathname: string): boolean {
  if (PUBLIC_EXACT.includes(pathname as typeof PUBLIC_EXACT[number])) return true;
  for (let i = 0; i < PUBLIC_PREFIXES.length; i++) {
    if (pathname.startsWith(PUBLIC_PREFIXES[i])) return true;
  }
  return false;
}

const SECURITY_HEADERS: ReadonlyArray<readonly [string, string]> = [
  ["X-DNS-Prefetch-Control", "off"],
  ["X-Content-Type-Options", "nosniff"],
  ["X-Frame-Options", "DENY"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  [
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), interest-cohort=()",
  ],
  ["Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload"],
  ["X-XSS-Protection", "1; mode=block"],
] as const;

function applySecurityHeaders(response: NextResponse): NextResponse {
  for (const [key, value] of SECURITY_HEADERS) {
    if (!response.headers.has(key)) {
      response.headers.set(key, value);
    }
  }
  return response;
}

export async function proxy(request: NextRequest) {
  const { supabase, getResponse } = createClient(request);

  /** A redirect that keeps any session cookies refreshed during this request. */
  const redirect = (url: URL) => {
    const res = NextResponse.redirect(url);
    for (const cookie of getResponse().cookies.getAll()) res.cookies.set(cookie);
    return applySecurityHeaders(res);
  };

  if (!supabase) {
    return applySecurityHeaders(getResponse());
  }

  const { pathname } = request.nextUrl;

  if (matchesPublic(pathname) && pathname !== "/login") {
    if (pathname.startsWith(PUBLIC_CARD_PREFIX)) {
      // Cards are shared by link/QR, never discovered via search engines.
      const response = getResponse();
      response.headers.set("X-Robots-Tag", "noindex, nofollow");
      return applySecurityHeaders(response);
    }
    return applySecurityHeaders(getResponse());
  }

  // getClaims() refreshes an expiring session (writing the new cookies onto
  // the response) and verifies the JWT. With asymmetric signing keys that check
  // is local, so the common request makes no Auth-server round trip; with a
  // symmetric secret it falls back to the same call getUser() makes.
  const { data: claimsData } = await supabase.auth.getClaims();
  const signedIn = Boolean(claimsData?.claims?.sub);

  const isLoginPath = pathname === "/login";

  if (!signedIn) {
    if (isLoginPath) return applySecurityHeaders(getResponse());
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return redirect(url);
  }

  // Role + visible sections in one RPC. The rules live in the DB
  // (0010_section_access.sql) and RLS enforces them again on the data; this
  // redirect is the page-level layer on top.
  const access = await getCurrentUserAccess(supabase);

  if (isLoginPath) {
    const url = request.nextUrl.clone();
    url.pathname = landingPath(access);
    url.search = "";
    return redirect(url);
  }

  const redirectTo = routeRedirect(pathname, access);
  if (redirectTo !== null) {
    const url = request.nextUrl.clone();
    url.pathname = redirectTo;
    url.search = "";
    return redirect(url);
  }

  return applySecurityHeaders(getResponse());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
