import { NextResponse } from "next/server";
import { cardUrl, parseSource } from "@/lib/cards";
import {
  googleWalletConfig,
  googleWalletPayload,
  googleWalletSaveUrl,
  signJwtRS256,
} from "@/lib/wallet";
import { getPublicCard, recordCardEvent, requestOrigin } from "../../data";

// PUBLIC — redirects to "Save to Google Wallet" with a freshly signed JWT.
// 404 until GOOGLE_WALLET_* env vars are configured (see .env.example).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: { token: string } }) {
  const config = googleWalletConfig();
  if (!config) return new NextResponse("Not found", { status: 404 });

  const card = await getPublicCard(params.token);
  if (!card) return new NextResponse("Not found", { status: 404 });

  const origin = requestOrigin(request);
  let jwt: string;
  try {
    jwt = signJwtRS256(
      googleWalletPayload(card, {
        config,
        cardUrl: cardUrl(origin, card.token),
        origin,
        logoUrl: `${origin}/icons/android-chrome-192x192.png`,
        iat: Math.floor(Date.now() / 1000),
      }),
      config.privateKey
    );
  } catch (err) {
    console.error("[cards] google wallet signing failed", err);
    return new NextResponse("Wallet pass unavailable", { status: 503 });
  }

  await recordCardEvent(card.token, "wallet_google", {
    source: parseSource(new URL(request.url).searchParams.get("s")),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.redirect(googleWalletSaveUrl(jwt), {
    status: 302,
    headers: { "Cache-Control": "no-store" },
  });
}
