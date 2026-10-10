"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { QrCode, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { CalculatorHeader } from "@/components/CalculatorHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";
import {
  buildLandingPage,
  buildVCard,
  CONTACT_DEFAULTS,
  destinationUrl,
  fileBase,
  makeMatrix,
  PALETTES,
  SUN,
  type PaletteId,
  type QrContact,
  type QrMode,
} from "@/lib/qrStudio";

const DEFAULT_LOGO = "/brand/logo-mark.png";
const CANVAS_PX = 1400;
const PALETTE_SWATCH: Record<PaletteId, { label: string; bg: string }> = {
  dawn: { label: "Dawn", bg: "linear-gradient(135deg,#3E8829,#043871)" },
  ocean: { label: "Ocean", bg: "linear-gradient(135deg,#1B74AE,#043871)" },
  grove: { label: "Grove", bg: "linear-gradient(135deg,#6FA931,#074C39)" },
  ink: { label: "Ink", bg: "#0F1B24" },
};

const DEFAULT_CONTACT: QrContact = { ...CONTACT_DEFAULTS, first: "Joseph Rannie", last: "Buluran", title: "Co-Founder" };

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Load an image and (optionally) downscale it so the landing page stays small. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = src;
  });
}

function toSmallDataUrl(im: HTMLImageElement, max = 256): string {
  const scale = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(im.naturalWidth * scale));
  c.height = Math.max(1, Math.round(im.naturalHeight * scale));
  c.getContext("2d")!.drawImage(im, 0, 0, c.width, c.height);
  return c.toDataURL("image/png");
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Chip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-coir/30",
        pressed ? "border-coir bg-coir-bg text-coir-dark" : "border-line bg-white text-ink-soft hover:text-ink hover:border-ink-soft"
      )}
    >
      {children}
    </button>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-panel p-5 shadow-card">
      <h2 className="mb-4 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-soft">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, htmlFor, wide, hint, children }: { label: string; htmlFor: string; wide?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-1", wide && "sm:col-span-2")}>
      <label htmlFor={htmlFor} className="text-[12px] font-semibold text-ink-soft">
        {label}
        {hint && <span className="ml-1 font-normal">— {hint}</span>}
      </label>
      {children}
    </div>
  );
}

export default function QrStudioPage() {
  const [mode, setMode] = useState<QrMode>("link");
  const [dest, setDest] = useState("https://bughaw.ph");
  const [tag, setTag] = useState("");
  const [c, setC] = useState<QrContact>(DEFAULT_CONTACT);
  const [palette, setPalette] = useState<PaletteId>("dawn");
  const [rounded, setRounded] = useState(true);
  const [showLogo, setShowLogo] = useState(true);
  const [sun, setSun] = useState(true);
  const [logoPct, setLogoPct] = useState(20);
  const [logo, setLogo] = useState<HTMLImageElement | null>(null);
  const [logoData, setLogoData] = useState("");
  const [pageBuilt, setPageBuilt] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const set = (k: keyof QrContact) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setC((prev) => ({ ...prev, [k]: e.target.value }));

  // Default brand logo, downscaled once (source PNG is large).
  useEffect(() => {
    let alive = true;
    loadImage(DEFAULT_LOGO)
      .then((im) => {
        if (!alive) return;
        setLogoData(toSmallDataUrl(im));
        setLogo(im);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const vcard = useMemo(() => buildVCard(c), [c]);
  const payload = mode === "link" ? destinationUrl(dest, tag) : vcard;
  const matrix = useMemo(() => (payload ? makeMatrix(payload) : null), [payload]);

  const warning = !payload
    ? "Add a destination URL and the code appears here."
    : !matrix
      ? mode === "link"
        ? "That URL is too long for one code. Shorten it, or point at a short path like bughaw.ph/seph."
        : "That is more contact detail than one QR code can carry. Trim the note or the address and it will fit."
      : showLogo && logoPct > 23
        ? "At this logo size some scanners will struggle. 20% or less is the safe zone."
        : null;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const S = canvas.width;
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, S, S);
    if (!matrix) return;

    const count = matrix.size;
    const quiet = 4;
    const cell = S / (count + quiet * 2);
    const off = quiet * cell;
    const stops = PALETTES[palette];
    const g = ctx.createLinearGradient(off, off, S - off, S - off);
    g.addColorStop(0, stops[0]);
    g.addColorStop(0.55, stops[1]);
    g.addColorStop(1, stops[2]);

    const isFinder = (r: number, col: number) =>
      (r < 7 && col < 7) || (r < 7 && col >= count - 7) || (r >= count - 7 && col < 7);

    ctx.fillStyle = g;
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        if (!matrix.isDark(row, col) || isFinder(row, col)) continue;
        const x = off + col * cell;
        const y = off + row * cell;
        if (rounded) {
          roundRect(ctx, x + cell * 0.06, y + cell * 0.06, cell * 0.88, cell * 0.88, cell * 0.34);
          ctx.fill();
        } else {
          ctx.fillRect(x, y, cell + 0.5, cell + 0.5);
        }
      }
    }

    // Finder eyes drawn as rings so they stay crisp at small sizes.
    for (const [r0, c0] of [[0, 0], [0, count - 7], [count - 7, 0]]) {
      const x = off + c0 * cell;
      const y = off + r0 * cell;
      const s = 7 * cell;
      ctx.fillStyle = g;
      roundRect(ctx, x, y, s, s, rounded ? cell * 1.9 : 0);
      ctx.fill();
      ctx.fillStyle = "#FFFFFF";
      roundRect(ctx, x + cell, y + cell, s - 2 * cell, s - 2 * cell, rounded ? cell * 1.25 : 0);
      ctx.fill();
      ctx.fillStyle = g;
      roundRect(ctx, x + 2 * cell, y + 2 * cell, s - 4 * cell, s - 4 * cell, rounded ? cell * 0.85 : 0);
      ctx.fill();
    }

    if (showLogo && logo) {
      const box = S * (logoPct / 100);
      const pad = cell * 0.9;
      const cx = (S - box) / 2;
      const cy = (S - box) / 2;
      ctx.fillStyle = "#FFFFFF";
      roundRect(ctx, cx - pad, cy - pad, box + pad * 2, box + pad * 2, box * 0.22);
      ctx.fill();
      if (sun) {
        ctx.strokeStyle = SUN;
        ctx.lineWidth = Math.max(2, cell * 0.42);
        roundRect(ctx, cx - pad * 0.45, cy - pad * 0.45, box + pad * 0.9, box + pad * 0.9, box * 0.2);
        ctx.stroke();
      }
      ctx.save();
      roundRect(ctx, cx, cy, box, box, box * 0.16);
      ctx.clip();
      ctx.drawImage(logo, cx, cy, box, box);
      ctx.restore();
    }
  }, [matrix, palette, rounded, showLogo, sun, logoPct, logo]);

  const fullName = `${c.first} ${c.last}`.trim();
  const base = fileBase(c);

  const onLogoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast.error("Choose an image file.");
      return;
    }
    const url = URL.createObjectURL(f);
    try {
      const im = await loadImage(url);
      setLogoData(toSmallDataUrl(im));
      setLogo(im);
    } catch {
      toast.error("Could not read that image.");
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const downloadPng = () =>
    canvasRef.current?.toBlob((b) => b && saveBlob(b, `${base}-qr.png`), "image/png");

  const downloadPage = () => {
    saveBlob(new Blob([buildLandingPage(c, logoData)], { type: "text/html;charset=utf-8" }), `${base}-page.html`);
    setPageBuilt(true);
    setTimeout(() => setPageBuilt(false), 2600);
  };

  const copyPayload = async () => {
    try {
      await navigator.clipboard.writeText(payload);
      toast.success(mode === "link" ? "Link copied." : "vCard copied.");
    } catch {
      toast.error("Copy failed — select the text under “What the QR encodes”.");
    }
  };

  const reset = () => {
    setMode("link");
    setDest("https://bughaw.ph");
    setTag("");
    setC(DEFAULT_CONTACT);
    setPalette("dawn");
    setRounded(true);
    setShowLogo(true);
    setSun(true);
    setLogoPct(20);
    loadImage(DEFAULT_LOGO)
      .then((im) => {
        setLogoData(toSmallDataUrl(im));
        setLogo(im);
      })
      .catch(() => {});
  };

  return (
    <div>
      <CalculatorHeader
        icon={QrCode}
        eyebrow="Bughaw Innovations · QR & landing page"
        title="QR Studio"
        description="Point a QR code at a web page — or straight at a contact card — and build a matching Bughaw-branded landing page to send it to. Everything is generated in your browser."
        action={
          <Button size="sm" className="mt-3" onClick={reset}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Reset to defaults
          </Button>
        }
      />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <Panel title="What the scan opens">
            <div className="flex flex-wrap gap-2" role="group" aria-label="QR destination">
              <Chip pressed={mode === "link"} onClick={() => setMode("link")}>Website link</Chip>
              <Chip pressed={mode === "vcard"} onClick={() => setMode("vcard")}>Contact card only</Chip>
            </div>
            {mode === "link" && (
              <div className="mt-4 grid gap-3">
                <Field label="Destination URL" htmlFor="qr-dest">
                  <Input id="qr-dest" type="url" value={dest} onChange={(e) => setDest(e.target.value)} placeholder="https://bughaw.ph/seph" />
                </Field>
                <Field label="Tag the source" htmlFor="qr-utm" hint="optional, appended as ?src=">
                  <Input id="qr-utm" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="card, expo-booth, sample-box" />
                </Field>
              </div>
            )}
            <p className="mt-3 text-[12px] text-ink-soft">
              {mode === "link"
                ? "The scan opens this address. The details below fill the landing page you build for it."
                : "The scan saves a contact straight to the phone. No page needed, no internet needed."}
            </p>
          </Panel>

          <Panel title="Person">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="First name" htmlFor="qr-first"><Input id="qr-first" value={c.first} onChange={set("first")} placeholder="Juan" /></Field>
              <Field label="Last name" htmlFor="qr-last"><Input id="qr-last" value={c.last} onChange={set("last")} placeholder="Dela Cruz" /></Field>
              <Field label="Role" htmlFor="qr-title" wide><Input id="qr-title" value={c.title} onChange={set("title")} placeholder="Co-Founder" /></Field>
            </div>
          </Panel>

          <Panel title="Reach">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Mobile" htmlFor="qr-mobile"><Input id="qr-mobile" type="tel" value={c.mobile} onChange={set("mobile")} placeholder="+63 917 000 0000" /></Field>
              <Field label="Office phone" htmlFor="qr-phone"><Input id="qr-phone" type="tel" value={c.phone} onChange={set("phone")} placeholder="+63 2 8000 0000" /></Field>
              <Field label="Email" htmlFor="qr-email" wide><Input id="qr-email" type="email" value={c.email} onChange={set("email")} placeholder="name@bughaw.ph" /></Field>
              <Field label="Website" htmlFor="qr-site" wide><Input id="qr-site" type="url" value={c.site} onChange={set("site")} placeholder="https://bughaw.ph" /></Field>
            </div>
          </Panel>

          <Panel title="Organization">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Company" htmlFor="qr-org" wide><Input id="qr-org" value={c.org} onChange={set("org")} /></Field>
              <Field label="Address" htmlFor="qr-addr" wide><Input id="qr-addr" value={c.addr} onChange={set("addr")} placeholder="Unit 1, Street, Barangay" /></Field>
              <Field label="City" htmlFor="qr-city"><Input id="qr-city" value={c.city} onChange={set("city")} placeholder="Pasig City" /></Field>
              <Field label="Province / region" htmlFor="qr-region"><Input id="qr-region" value={c.region} onChange={set("region")} placeholder="Metro Manila" /></Field>
              <Field label="Postal code" htmlFor="qr-zip"><Input id="qr-zip" value={c.zip} onChange={set("zip")} placeholder="1600" /></Field>
              <Field label="Country" htmlFor="qr-country"><Input id="qr-country" value={c.country} onChange={set("country")} /></Field>
              <Field label="Note on the card" htmlFor="qr-note" wide>
                <Textarea id="qr-note" rows={3} value={c.note} onChange={set("note")} placeholder="Agri-waste packaging for EPR compliance." />
              </Field>
            </div>
          </Panel>
        </div>

        <aside className="lg:sticky lg:top-5">
          <div className="rounded-xl border border-line bg-panel p-5 text-center shadow-card">
            <canvas
              ref={canvasRef}
              width={CANVAS_PX}
              height={CANVAS_PX}
              role="img"
              aria-label={matrix ? `QR code for ${fullName || "this contact"}` : "QR code preview (empty)"}
              className="mx-auto block h-auto w-full max-w-[300px] rounded-lg"
            />
            <p className="mt-2 text-[11px] tracking-wide text-ink-soft">
              {matrix ? `${matrix.size}×${matrix.size} modules · error correction H${matrix.size >= 85 ? " · dense, print 4 cm or larger" : ""}` : " "}
            </p>

            <div className="mt-3.5 border-t border-line pt-3.5">
              <div className="font-display text-lg text-ink">{fullName || "Your name"}</div>
              <div className="mt-0.5 text-[13px] text-ink-soft">{c.title || "—"}</div>
              <div className="mt-2 font-mono text-[11px] uppercase tracking-[0.12em] text-coir-dark">{c.org}</div>
            </div>

            <div className="mt-4 flex flex-wrap justify-center gap-2" role="group" aria-label="Colour">
              {(Object.keys(PALETTE_SWATCH) as PaletteId[]).map((id) => (
                <Chip key={id} pressed={palette === id} onClick={() => setPalette(id)}>
                  <span className="inline-block h-3 w-3 rounded-full" style={{ background: PALETTE_SWATCH[id].bg }} aria-hidden />
                  {PALETTE_SWATCH[id].label}
                </Chip>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap justify-center gap-2" role="group" aria-label="Shape and logo">
              <Chip pressed={rounded} onClick={() => setRounded((v) => !v)}>{rounded ? "Rounded modules" : "Square modules"}</Chip>
              <Chip pressed={showLogo} onClick={() => setShowLogo((v) => !v)}>{showLogo ? "Logo in centre" : "No logo"}</Chip>
              <Chip pressed={sun} onClick={() => setSun((v) => !v)}>{sun ? "Sun ring" : "No ring"}</Chip>
            </div>

            <div className="mt-4 flex items-center gap-3 text-[12px] font-semibold text-ink-soft">
              <label htmlFor="qr-logo-size">Logo size</label>
              <input
                id="qr-logo-size"
                type="range"
                min={12}
                max={26}
                value={logoPct}
                onChange={(e) => setLogoPct(+e.target.value)}
                className="flex-1 accent-[#1B74AE]"
              />
              <span className="w-9 text-right tabular-nums">{logoPct}%</span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <Button intent="primary" className="col-span-2 py-2.5" onClick={downloadPng} disabled={!matrix}>
                Download QR as PNG
              </Button>
              <Button className="col-span-2 py-2.5" onClick={downloadPage}>
                {pageBuilt ? "Page built — rename it index.html" : "Build landing page"}
              </Button>
              <Button onClick={() => saveBlob(new Blob([vcard], { type: "text/vcard;charset=utf-8" }), `${base}.vcf`)}>Download .vcf</Button>
              <Button onClick={copyPayload} disabled={!payload}>{mode === "link" ? "Copy link" : "Copy vCard"}</Button>
            </div>

            {warning && (
              <p role="status" className="mt-3 rounded-lg border border-amber-border bg-amber-bg px-3 py-2 text-left text-[12px] text-amber">
                {warning}
              </p>
            )}

            <p className="mt-3 text-left text-[12px] text-ink-soft">
              Print at 3 cm or larger and test with your own camera before it goes to the printer.{" "}
              <label htmlFor="qr-logo-file" className="cursor-pointer font-semibold text-coir-dark underline underline-offset-2">
                Use a different logo
              </label>
              <input id="qr-logo-file" type="file" accept="image/*" className="sr-only" onChange={onLogoFile} />
            </p>

            <details className="mt-4 text-left">
              <summary className="cursor-pointer text-[12px] font-semibold text-ink-soft">See what the QR encodes</summary>
              <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-paper p-3 font-mono text-[11px] leading-relaxed">
                {payload || "—"}
              </pre>
            </details>
            <details className="mt-3 text-left">
              <summary className="cursor-pointer text-[12px] font-semibold text-ink-soft">How to get the page online</summary>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-[12px] text-ink-soft">
                <li>Build the landing page and rename the file <code className="rounded bg-paper px-1">index.html</code>.</li>
                <li>Drop it on any static host — GitHub Pages, Netlify, Cloudflare Pages, or your own bughaw.ph server.</li>
                <li>Paste the live address into Destination URL, then download the QR.</li>
              </ol>
              <p className="mt-2 text-[12px] text-ink-soft">
                The page is one self-contained file. The logo travels inside it, so nothing breaks when you move it.
              </p>
            </details>
          </div>
        </aside>
      </div>
    </div>
  );
}
