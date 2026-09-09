import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/middleware";

// /api/crm/ingest authenticates with a shared secret checked inside Postgres,
// not with a user session — see supabase/migrations/0003_crm.sql.
const PUBLIC_EXACT = ["/login", "/api/crm/ingest"] as const;
const PUBLIC_PREFIXES = ["/auth/"] as const;
const CALCULATOR_PREFIXES = ["/calculators/", "/tools/", "/saved/", "/crm/"] as const;
const CALCULATOR_EXACT = ["/", "/calculators", "/tools", "/saved", "/crm"] as const;

function matchesPublic(pathname: string): boolean {
  if (PUBLIC_EXACT.includes(pathname as typeof PUBLIC_EXACT[number])) return true;
  for (let i = 0; i < PUBLIC_PREFIXES.length; i++) {
    if (pathname.startsWith(PUBLIC_PREFIXES[i])) return true;
  }
  return false;
}

function matchesCalculatorBlock(pathname: string): boolean {
  if (CALCULATOR_EXACT.includes(pathname as typeof CALCULATOR_EXACT[number])) return true;
  for (let i = 0; i < CALCULATOR_PREFIXES.length; i++) {
    if (pathname.startsWith(CALCULATOR_PREFIXES[i])) return true;
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

export async function middleware(request: NextRequest) {
  const { supabase, response } = createClient(request);

  if (!supabase) {
    return applySecurityHeaders(response);
  }

  const { pathname } = request.nextUrl;

  if (matchesPublic(pathname) && pathname !== "/login") {
    return applySecurityHeaders(response);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLoginPath = pathname === "/login";

  if (!user) {
    if (isLoginPath) return applySecurityHeaders(response);
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return applySecurityHeaders(NextResponse.redirect(url));
  }

  const { data: role } = await supabase.rpc("current_user_role");
  const isContractor = role === "contractor";

  if (isLoginPath) {
    const url = request.nextUrl.clone();
    url.pathname = isContractor ? "/tasks" : "/";
    url.search = "";
    return applySecurityHeaders(NextResponse.redirect(url));
  }

  if (isContractor && matchesCalculatorBlock(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/tasks";
    url.search = "";
    return applySecurityHeaders(NextResponse.redirect(url));
  }

  return applySecurityHeaders(response);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
