import { NextResponse } from "next/server";
import { isValidCardToken, parseClickTarget, parseSource } from "@/lib/cards";
import { recordCardEvent } from "../data";

// PUBLIC — click beacon from CardClickTracker. Accepts only a known click
// target; the RPC re-validates, ignores unpublished cards and throttles.
// Always answers 204 so a caller learns nothing about the token.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 512;

export async function POST(request: Request, { params }: { params: { token: string } }) {
  const empty = new NextResponse(null, { status: 204 });
  if (!isValidCardToken(params.token)) return empty;

  // Same-origin only. Compare against the Host header: inside Next,
  // request.url's host is not necessarily the one the browser used.
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (origin) {
    let originHost = "";
    try {
      originHost = new URL(origin).host;
    } catch {
      return empty;
    }
    if (!host || originHost !== host) return empty;
  }

  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return empty;
    body = JSON.parse(text);
  } catch {
    return empty;
  }
  if (!body || typeof body !== "object") return empty;

  const { target, source } = body as { target?: unknown; source?: unknown };
  const clickTarget = parseClickTarget(target);
  if (!clickTarget) return empty;

  await recordCardEvent(params.token, "click", {
    target: clickTarget,
    source: parseSource(typeof source === "string" ? source : null),
    userAgent: request.headers.get("user-agent"),
  });
  return empty;
}
