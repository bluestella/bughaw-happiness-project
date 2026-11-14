import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

function getSupabaseCredentials() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}

export function createClient(request: NextRequest) {
  const { url, key } = getSupabaseCredentials();

  if (!url || !key) {
    const response = NextResponse.next({
      request: {
        headers: request.headers,
      },
    });
    return { supabase: null, getResponse: () => response };
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // `setAll` replaces `response` when the session is refreshed, so callers must
  // read it through this getter after their auth calls. Capturing it before
  // would drop the refreshed cookies and re-refresh on every request.
  return { supabase, getResponse: () => response };
}