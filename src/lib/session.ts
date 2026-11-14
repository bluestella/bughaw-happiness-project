import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAccess } from "@/utils/supabase/access";
import type { Access } from "@/lib/access";

/**
 * Request-scoped auth for server components. The layout and the page render in
 * the same request, so wrapping these in React `cache()` means one Supabase
 * client, one identity check and one `current_user_access()` RPC per request,
 * however many components ask. Before this, a single page load made the same
 * Auth-server call and RPC two or three times in sequence.
 *
 * This is UI gating only. RLS is the security boundary (AGENTS.md §4.1).
 */

export const getSupabase = cache(() => createClient());

export type SessionUser = {
  id: string;
  /** As stored by Auth. Lower-case it before comparing. */
  email: string | null;
  metadata: Record<string, unknown>;
};

/**
 * The signed-in user, from the verified access token. `getClaims()` checks the
 * JWT signature locally when the project uses asymmetric signing keys (no
 * network), and otherwise falls back to the Auth server exactly like
 * `getUser()`, so it is never weaker than `getUser()`.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    metadata: (claims.user_metadata ?? {}) as Record<string, unknown>,
  };
});

/** Role + visible sections (0010_section_access.sql), fetched once per request. */
export const getAccess = cache(async (): Promise<Access> =>
  getCurrentUserAccess(await getSupabase())
);
