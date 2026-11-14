import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiError, getRequestId, isSameOrigin } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function POST(request: Request) {
  // A cross-site form must not be able to sign people out (login CSRF's cousin).
  if (!isSameOrigin(request)) {
    return apiError("forbidden", "Forbidden.", { requestId: getRequestId(request) });
  }
  const supabase = await createClient();
  await supabase.auth.signOut();
  // 303: the browser follows a POST's redirect with a GET.
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
