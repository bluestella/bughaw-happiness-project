import { after } from "next/server";
import { isValidCardToken, parseClickTarget, parseSource } from "@/lib/cards";
import { apiEmpty, getRequestId, isSameOrigin, readJsonObject } from "@/lib/api/http";
import { recordCardEvent } from "../data";

// PUBLIC — click beacon from CardClickTracker. Accepts only a known click
// target; the RPC re-validates, ignores unpublished cards and throttles.
// Always answers 204 so a caller learns nothing about the token.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

const MAX_BODY = 512;

export async function POST(request: Request, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const empty = apiEmpty({ requestId: getRequestId(request) });
  if (!isValidCardToken(params.token) || !isSameOrigin(request)) return empty;

  // sendBeacon sets the Blob's type, but a fetch fallback may not: don't insist.
  const read = await readJsonObject(request, { maxBytes: MAX_BODY, requireJsonContentType: false });
  if (!read.ok) return empty;

  const { target, source } = read.value as { target?: unknown; source?: unknown };
  const clickTarget = parseClickTarget(target);
  if (!clickTarget) return empty;

  const userAgent = request.headers.get("user-agent");
  // Analytics never delays the response: on Vercel, after() runs via waitUntil.
  after(() =>
    recordCardEvent(params.token, "click", {
      target: clickTarget,
      source: parseSource(typeof source === "string" ? source : null),
      userAgent,
    })
  );
  return empty;
}
