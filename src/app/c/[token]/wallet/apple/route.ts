import { NextResponse } from "next/server";
import { cardUrl, parseSource } from "@/lib/cards";
import { appleWalletConfig, buildApplePass } from "@/lib/wallet";
import { getPublicCard, recordCardEvent, requestOrigin } from "../../data";

// PUBLIC — returns a signed .pkpass for Apple Wallet.
// 404 until APPLE_* env vars are configured (see .env.example).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function fetchAsset(origin: string, path: string): Promise<Buffer> {
  const res = await fetch(`${origin}${path}`, { cache: "force-cache" });
  if (!res.ok) throw new Error(`asset ${path} → ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function GET(request: Request, { params }: { params: { token: string } }) {
  const config = appleWalletConfig();
  if (!config) return new NextResponse("Not found", { status: 404 });

  const card = await getPublicCard(params.token);
  if (!card) return new NextResponse("Not found", { status: 404 });

  // Static brand assets come from this deployment's own public/ folder.
  const assetOrigin = new URL(request.url).origin;
  let pkpass: Buffer;
  try {
    const [icon, logo] = await Promise.all([
      fetchAsset(assetOrigin, "/apple-touch-icon.png"),
      fetchAsset(assetOrigin, "/brand/logo-mark.png"),
    ]);
    pkpass = await buildApplePass(card, {
      config,
      cardUrl: cardUrl(requestOrigin(request), card.token),
      icon,
      logo,
    });
  } catch (err) {
    console.error("[cards] apple wallet pass failed", err);
    return new NextResponse("Wallet pass unavailable", { status: 503 });
  }

  await recordCardEvent(card.token, "wallet_apple", {
    source: parseSource(new URL(request.url).searchParams.get("s")),
    userAgent: request.headers.get("user-agent"),
  });

  return new NextResponse(new Uint8Array(pkpass), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.apple.pkpass",
      "Content-Disposition": `attachment; filename="bughaw-card.pkpass"`,
      "Cache-Control": "no-store",
    },
  });
}
