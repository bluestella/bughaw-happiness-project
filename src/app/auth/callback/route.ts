import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getRequestId, logApi } from "@/lib/api/http";
import { safeRedirectPath } from "@/lib/api/redirect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

// OAuth code → session exchange. `next` is untrusted input: safeRedirectPath
// keeps the redirect on this site (no open redirect).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeRedirectPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    logApi("warn", "auth.callback_failed", { requestId: getRequestId(request), error: error.name });
  }
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
