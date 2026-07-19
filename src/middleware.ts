import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/middleware";

const PUBLIC_PATHS = ["/login", "/auth"];
// Routes contractors are locked out of (they only get task management).
const CALCULATOR_PATHS = ["/calculators", "/tools", "/saved"];

export async function middleware(request: NextRequest) {
  const { supabase, response } = createClient(request);

  if (!supabase) {
    return response;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user) {
    const { data: role } = await supabase.rpc("current_user_role");
    const isContractor = role === "contractor";

    if (pathname === "/login") {
      const url = request.nextUrl.clone();
      url.pathname = isContractor ? "/tasks" : "/";
      url.search = "";
      return NextResponse.redirect(url);
    }

    if (
      isContractor &&
      (pathname === "/" || CALCULATOR_PATHS.some((p) => pathname.startsWith(p)))
    ) {
      const url = request.nextUrl.clone();
      url.pathname = "/tasks";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
