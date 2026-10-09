import { cache } from "react";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import {
  deviceFromUserAgent,
  isBotUserAgent,
  isValidCardToken,
  type CardEvent,
  type CardSource,
  type ClickTarget,
  type PublicCard,
} from "@/lib/cards";

// Server-side access for the public /c/<token> surface. Everything goes
// through the two security-definer RPCs in 0009_digital_cards.sql; this layer
// never touches a table and never sees unpublished cards or hidden fields.

/** Deduped per request so generateMetadata and the page share one RPC call. */
export const getPublicCard = cache(async (token: string): Promise<PublicCard | null> => {
  if (!isValidCardToken(token)) return null;
  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("get_public_card", { p_token: token });
    if (error) {
      console.error("[cards] get_public_card failed", error.message);
      return null;
    }
    const row = Array.isArray(data) ? data[0] : null;
    return (row as PublicCard | undefined) ?? null;
  } catch (err) {
    console.error("[cards] get_public_card error", err);
    return null;
  }
});

/**
 * Best-effort analytics write. Bots and link-preview fetchers are skipped;
 * failures are swallowed so analytics can never break the card.
 */
export async function recordCardEvent(
  token: string,
  event: CardEvent,
  opts: { source?: CardSource; target?: ClickTarget | null; userAgent?: string | null } = {}
): Promise<void> {
  const ua = opts.userAgent ?? headers().get("user-agent");
  if (!isValidCardToken(token) || isBotUserAgent(ua)) return;
  try {
    const supabase = createClient();
    const { error } = await supabase.rpc("record_card_event", {
      p_token: token,
      p_event: event,
      p_target: opts.target ?? null,
      p_source: opts.source ?? "link",
      p_device: deviceFromUserAgent(ua),
    });
    if (error) console.error("[cards] record_card_event failed", error.message);
  } catch (err) {
    console.error("[cards] record_card_event error", err);
  }
}

/** Absolute origin of this request (used for QR / wallet / vCard URLs). */
export function requestOrigin(request?: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  if (configured && configured.startsWith("https://")) return configured;
  if (request) return new URL(request.url).origin;
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
