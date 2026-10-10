"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { StyledQr } from "@/components/cards/StyledQr";
import {
  CardIdentity,
  SunDivider,
  chipClass,
  primaryGradientButton,
  secondaryButton,
} from "@/components/cards/CardParts";
import { cn } from "@/lib/cn";
import { buildVCard, cardUrl, toPublicCard, vcardFileName, type CardDraft } from "@/lib/cards";
import {
  LOGO_SIZE_MAX,
  LOGO_SIZE_MIN,
  QR_LOGO_EXPORT_SRC,
  QR_THEMES,
  QR_THEME_DEF,
  buildQrModel,
  normalizeQrStyle,
  qrCaption,
  type QrStyle,
} from "@/lib/qrStyle";
import { copyText, downloadBlob } from "./shareUtils";

const EXPORT_PX = 2048;
const EXPORT_MARGIN = 4; // full quiet zone for print

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Admin QR designer: theme, rounded modules, centre logo, sun ring and logo
 * size are saved with the card (qr_style) and drive the public card's QR.
 * The QR content is always the card link (`?s=qr`) and is not configurable.
 */
export function QrDesigner({
  value,
  draft,
  saved,
  baseUrl,
  onChange,
  className,
}: {
  /** What the QR encodes — always the card link (cardUrl(..., "qr")). */
  value: string;
  draft: CardDraft;
  /** The saved card (token + published fields), or null before first save. */
  saved: { token: string; draft: CardDraft } | null;
  baseUrl: string;
  onChange: (style: QrStyle) => void;
  className?: string;
}) {
  const style = useMemo(() => normalizeQrStyle(draft.qr_style), [draft.qr_style]);
  const token = baseUrl ? saved?.token ?? null : null;
  const model = useMemo(() => buildQrModel(value, style), [value, style]);
  const exportRef = useRef<SVGSVGElement>(null);
  const [exportLogo, setExportLogo] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Inline the logo once so the exported SVG has no external reference.
  useEffect(() => {
    let cancelled = false;
    fetch(QR_LOGO_EXPORT_SRC)
      .then((r) => r.blob())
      .then(blobToDataUrl)
      .then((url) => !cancelled && setExportLogo(url))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const vcard =
    saved && baseUrl ? buildVCard(toPublicCard(saved.draft, saved.token), cardUrl(baseUrl, saved.token)) : "";
  const fileBase = vcardFileName(saved?.draft.full_name || draft.full_name).replace(/\.vcf$/, "");

  function set(patch: Partial<QrStyle>) {
    onChange(normalizeQrStyle({ ...style, ...patch }));
  }

  async function downloadPng() {
    const node = exportRef.current;
    if (!node || !token) return;
    setExporting(true);
    try {
      const svg = new XMLSerializer().serializeToString(node);
      const img = new Image();
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = EXPORT_PX;
      canvas.height = EXPORT_PX;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no canvas");
      ctx.drawImage(img, 0, 0, EXPORT_PX, EXPORT_PX);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("no blob");
      downloadBlob(blob, `${fileBase}-qr.png`);
    } catch {
      toast.error("Could not render the PNG. Try again, or use a desktop browser.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <section
      aria-label="QR code design"
      className={cn("rounded-[28px] border border-line/80 bg-white px-6 pb-7 pt-8 shadow-card sm:px-10", className)}
    >
      <StyledQr
        id="designer-qr"
        value={value}
        qrStyle={style}
        model={model}
        title={`QR code preview for ${draft.full_name || "this card"}`}
        className={cn("mx-auto block w-full max-w-[300px]", !token && "opacity-40")}
      />
      <p className="mt-5 text-center font-mono text-[12.5px] tracking-[0.02em] text-ink-soft">
        {token ? qrCaption(model) : "Create the card to generate its QR code"}
      </p>

      <hr className="my-6 border-line" />

      <CardIdentity name={draft.full_name || "Your name"} title={draft.job_title} as="p" />
      <SunDivider className="mt-6" />

      <div className="mt-6 flex flex-wrap gap-2.5" role="radiogroup" aria-label="QR colour theme">
        {QR_THEMES.map((t) => {
          const stops = QR_THEME_DEF[t].stops;
          return (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={style.theme === t}
              onClick={() => set({ theme: t })}
              className={chipClass(style.theme === t)}
            >
              <span
                aria-hidden
                className="h-3.5 w-3.5 rounded-full"
                style={{
                  background: `linear-gradient(135deg, ${stops.map(([o, c]) => `${c} ${o * 100}%`).join(", ")})`,
                }}
              />
              {QR_THEME_DEF[t].label}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-2.5">
        {(
          [
            ["rounded", "Rounded modules"],
            ["logo", "Logo in centre"],
            ["sunRing", "Sun ring"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={style[key]}
            disabled={key === "sunRing" && !style.logo}
            onClick={() => set({ [key]: !style[key] })}
            className={cn(chipClass(style[key]), "disabled:cursor-not-allowed disabled:opacity-40")}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-5 flex items-center gap-4">
        <label htmlFor="qr-logo-size" className="shrink-0 text-[14px] font-medium text-ink-soft">
          Logo size
        </label>
        <input
          id="qr-logo-size"
          type="range"
          min={LOGO_SIZE_MIN}
          max={LOGO_SIZE_MAX}
          step={1}
          value={style.logoSize}
          disabled={!style.logo}
          onChange={(e) => set({ logoSize: Number(e.target.value) })}
          className="flex-1 disabled:opacity-40"
          style={{
            height: 8,
            borderRadius: 999,
            background: `linear-gradient(to right, var(--accent) ${
              ((style.logoSize - LOGO_SIZE_MIN) / (LOGO_SIZE_MAX - LOGO_SIZE_MIN)) * 100
            }%, var(--line) 0)`,
          }}
        />
        <span className="w-10 shrink-0 text-right font-mono text-[14px] tabular-nums text-ink">
          {style.logoSize}%
        </span>
      </div>

      <div className="mt-6 space-y-3">
        <button
          type="button"
          className={primaryGradientButton}
          disabled={!token || !exportLogo || exporting}
          onClick={downloadPng}
        >
          {exporting ? "Rendering…" : "Download PNG"}
        </button>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            className={secondaryButton}
            disabled={!vcard}
            onClick={() => downloadBlob(new Blob([vcard], { type: "text/vcard" }), `${fileBase}.vcf`)}
          >
            Download .vcf
          </button>
          <button
            type="button"
            className={secondaryButton}
            disabled={!vcard}
            onClick={() => copyText(vcard, "vCard")}
          >
            Copy vCard
          </button>
        </div>
      </div>

      <p className="mt-4 text-[13.5px] leading-relaxed text-ink-soft">
        Print at 3 cm or larger. Test with your own phone camera before you send it to the printer. Style
        changes apply to the public card after you save.
      </p>

      {vcard && (
        <details className="group mt-4 text-center">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[14px] font-semibold text-ink-soft hover:text-ink [&::-webkit-details-marker]:hidden">
            <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" aria-hidden />
            See the vCard text
          </summary>
          <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-line bg-frost p-4 text-left font-mono text-[12px] leading-relaxed text-ink">
            {vcard}
          </pre>
        </details>
      )}

      {/* Off-screen export copy: full quiet zone and an inlined logo. */}
      {token && exportLogo && (
        <StyledQr
          ref={exportRef}
          id="export-qr"
          value={value}
          qrStyle={style}
          margin={EXPORT_MARGIN}
          logoHref={exportLogo}
          className="hidden"
        />
      )}
    </section>
  );
}
