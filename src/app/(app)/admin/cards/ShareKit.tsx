"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Copy, Download, ExternalLink, Nfc, RotateCcw, Signature, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  COMPANY_NAME,
  buildEmailSignatureHtml,
  cardUrl,
  vcardFileName,
  type BusinessCard,
} from "@/lib/cards";

// QR in Bughaw dark blue on white — high contrast for reliable scanning.
const QR_DARK = "#17517D";
const QR_LIGHT = "#FFFFFF";

/** Public base URL: NEXT_PUBLIC_SITE_URL when it is a real https origin, else this tab's origin. */
function shareBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  if (configured && configured.startsWith("https://")) return configured;
  return typeof window === "undefined" ? "" : window.location.origin;
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyText(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied.`);
  } catch {
    toast.error("Copy failed — select the text and copy it manually.");
  }
}

function Row({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Copy;
  title: string;
  description: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-t border-line py-3 first:border-t-0 first:pt-0">
      <div className="flex min-w-0 flex-1 gap-2.5">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-coir" strokeWidth={1.75} aria-hidden />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-ink">{title}</p>
          <div className="text-[12px] text-ink-soft">{description}</div>
        </div>
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

export function ShareKit({
  card,
  dirty,
  onTokenRotated,
  onDeleted,
}: {
  card: BusinessCard;
  dirty: boolean;
  onTokenRotated: (token: string) => void;
  onDeleted: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [base, setBase] = useState("");
  const [qrSvg, setQrSvg] = useState("");
  const [confirm, setConfirm] = useState<"rotate" | "delete" | null>(null);

  useEffect(() => setBase(shareBaseUrl()), []);

  const link = base ? cardUrl(base, card.token) : "";
  const qrLink = base ? cardUrl(base, card.token, "qr") : "";
  const nfcLink = base ? cardUrl(base, card.token, "nfc") : "";
  const emailLink = base ? cardUrl(base, card.token, "email") : "";
  const fileBase = vcardFileName(card.full_name).replace(/\.vcf$/, "");
  const published = card.status === "published";

  useEffect(() => {
    if (!qrLink) return;
    let cancelled = false;
    QRCode.toString(qrLink, {
      type: "svg",
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: QR_DARK, light: QR_LIGHT },
    }).then((svg) => !cancelled && setQrSvg(svg));
    return () => {
      cancelled = true;
    };
  }, [qrLink]);

  async function downloadPng() {
    const dataUrl = await QRCode.toDataURL(qrLink, {
      width: 1024,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: QR_DARK, light: QR_LIGHT },
    });
    const blob = await (await fetch(dataUrl)).blob();
    downloadBlob(blob, `${fileBase}-qr.png`);
  }

  async function copySignature() {
    const html = buildEmailSignatureHtml(card, {
      cardUrl: emailLink,
      logoUrl: `${base}/brand/logo-mark.png`,
    });
    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([`${card.full_name} · ${COMPANY_NAME}\n${emailLink}`], {
              type: "text/plain",
            }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(html);
      }
      toast.success("Signature copied — paste it into Gmail or Outlook signature settings.");
    } catch {
      toast.error("Copy failed. Try again from a desktop browser.");
    }
  }

  async function rotate() {
    const { data, error } = await supabase.rpc("admin_rotate_card_token", { p_card_id: card.id });
    if (error || typeof data !== "string") {
      toast.error(error?.message ?? "Could not replace the link.");
      return;
    }
    onTokenRotated(data);
    toast.success("New link issued. Old links, QR codes and NFC tags no longer work.");
  }

  async function remove() {
    const { error } = await supabase.from("business_cards").delete().eq("id", card.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    onDeleted();
    toast.success("Card and its analytics deleted.");
  }

  return (
    <section className="rounded-xl border border-line bg-white p-4 shadow-card" aria-label="Share this card">
      <p className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.1em] text-coir-dark">Share</p>

      {!published && (
        <p className="mb-3 rounded-md border border-amber-border bg-amber-bg px-3 py-2 text-[12px] text-amber">
          This card is {card.status}. Its link shows “not available” until you set it to Published.
        </p>
      )}
      {dirty && (
        <p className="mb-3 rounded-md border border-line bg-paper px-3 py-2 text-[12px] text-ink-soft">
          You have unsaved edits — save them before sharing.
        </p>
      )}

      <Row
        icon={ExternalLink}
        title="Card link"
        description={
          <>
            <span className="block break-all font-mono text-[11.5px]">{link || "…"}</span>
            Opening it yourself counts as a view.
          </>
        }
      >
        <Button size="sm" onClick={() => copyText(link, "Link")} disabled={!link}>
          <Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Copy
        </Button>
        <Button size="sm" asChild>
          <a href={link} target="_blank" rel="noopener noreferrer">
            Open
          </a>
        </Button>
      </Row>

      <Row
        icon={Download}
        title="QR code"
        description="For print, booths and slides. Scans are counted as “QR code” in analytics."
      >
        <Button
          size="sm"
          disabled={!qrSvg}
          onClick={() => downloadBlob(new Blob([qrSvg], { type: "image/svg+xml" }), `${fileBase}-qr.svg`)}
        >
          SVG
        </Button>
        <Button size="sm" disabled={!qrLink} onClick={downloadPng}>
          PNG
        </Button>
      </Row>
      {qrSvg && (
        <div className="mb-3 flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg)}`}
            alt={`QR code linking to ${card.full_name}'s card`}
            width={148}
            height={148}
            className="rounded-[3px] border border-line"
          />
        </div>
      )}

      <Row
        icon={Nfc}
        title="NFC tag link"
        description="Write this URL to an NFC sticker or card with any NFC writer app. Taps are counted as “NFC tap”."
      >
        <Button size="sm" onClick={() => copyText(nfcLink, "NFC link")} disabled={!nfcLink}>
          <Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Copy
        </Button>
      </Row>

      <Row
        icon={Signature}
        title="Email signature"
        description="Name, title, logo and a “View my digital card” link. Paste into Gmail or Outlook settings."
      >
        <Button size="sm" onClick={copySignature} disabled={!emailLink}>
          <Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Copy
        </Button>
      </Row>

      <Row
        icon={RotateCcw}
        title="Replace link"
        description="Issues a new random link. Every printed QR, NFC tag and signature for this card stops working."
      >
        <Button size="sm" intent="danger" onClick={() => setConfirm("rotate")}>
          Replace
        </Button>
      </Row>

      <Row icon={Trash2} title="Delete card" description="Removes the card and all of its analytics. Cannot be undone.">
        <Button size="sm" intent="danger" onClick={() => setConfirm("delete")}>
          Delete
        </Button>
      </Row>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={confirm === "delete" ? `Delete ${card.full_name}'s card?` : "Replace this card's link?"}
        description={
          confirm === "delete"
            ? "The public link stops working and its view history is deleted."
            : "Anyone using the old link, QR code or NFC tag will see “not available”. You'll need to reprint or rewrite them."
        }
        confirmLabel={confirm === "delete" ? "Delete" : "Replace link"}
        onConfirm={() => (confirm === "delete" ? remove() : rotate())}
      />
    </section>
  );
}
