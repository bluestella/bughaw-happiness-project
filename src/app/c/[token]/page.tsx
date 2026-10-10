import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicCardView } from "@/components/cards/PublicCardView";
import { COMPANY_NAME, cardUrl, parseSource } from "@/lib/cards";
import { appleWalletConfig, googleWalletConfig } from "@/lib/wallet";
import { getPublicCard, recordCardEvent, requestOrigin } from "./data";
import { CardClickTracker } from "./CardClickTracker";

// PUBLIC route — no sign-in. Middleware lets /c/* through untouched; the only
// data this page can reach is get_public_card() (published cards, display-safe
// columns). See docs/digital-cards.md and docs/security.md §8.

export const dynamic = "force-dynamic";

type Props = { params: { token: string }; searchParams: { s?: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const card = await getPublicCard(params.token);
  const robots = { index: false, follow: false, nocache: true };
  if (!card) return { title: { absolute: COMPANY_NAME }, robots };
  const title = card.job_title
    ? `${card.full_name} — ${card.job_title}, ${COMPANY_NAME}`
    : `${card.full_name} — ${COMPANY_NAME}`;
  return {
    title: { absolute: title },
    description: card.bio || `Digital business card from ${COMPANY_NAME}.`,
    robots,
    openGraph: { title, description: card.bio || undefined, type: "profile" },
  };
}

export default async function PublicCardPage({ params, searchParams }: Props) {
  const card = await getPublicCard(params.token);
  if (!card) notFound();

  const source = parseSource(searchParams.s);
  await recordCardEvent(card.token, "view", { source });

  return (
    <>
      <PublicCardView
        card={card}
        qrValue={cardUrl(requestOrigin(), card.token, "qr")}
        source={source}
        wallet={{ apple: appleWalletConfig() !== null, google: googleWalletConfig() !== null }}
      />
      <CardClickTracker token={card.token} source={source} />
    </>
  );
}
