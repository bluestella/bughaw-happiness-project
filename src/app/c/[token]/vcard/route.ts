import { NextResponse } from "next/server";
import { buildVCard, cardUrl, parseSource, vcardFileName } from "@/lib/cards";
import { getPublicCard, recordCardEvent, requestOrigin } from "../data";

// PUBLIC — "Save contact": returns the card as a vCard 3.0 file.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: { token: string } }) {
  const card = await getPublicCard(params.token);
  if (!card) return new NextResponse("Not found", { status: 404 });

  const source = parseSource(new URL(request.url).searchParams.get("s"));
  await recordCardEvent(card.token, "save_contact", {
    source,
    userAgent: request.headers.get("user-agent"),
  });

  const vcf = buildVCard(card, cardUrl(requestOrigin(request), card.token));
  return new NextResponse(vcf, {
    status: 200,
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition": `attachment; filename="${vcardFileName(card.full_name)}"`,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
