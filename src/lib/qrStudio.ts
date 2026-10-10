// QR Studio — pure helpers (payloads, vCard, landing page HTML, QR matrix).
// Migrated from the standalone bughaw-qr-studio.html. No DOM access here.

import QRCode from "qrcode";

export type QrMode = "link" | "vcard";
export type PaletteId = "dawn" | "ocean" | "grove" | "ink";

export const PALETTES: Record<PaletteId, readonly [string, string, string]> = {
  dawn: ["#3E8829", "#0E6398", "#043871"],
  ocean: ["#1B74AE", "#0A5288", "#032A55"],
  grove: ["#5C9A2A", "#1F6E3C", "#074C39"],
  ink: ["#12202B", "#12202B", "#12202B"],
};

export const SUN = "#F2B233";

export interface QrContact {
  first: string;
  last: string;
  title: string;
  mobile: string;
  phone: string;
  email: string;
  site: string;
  org: string;
  addr: string;
  city: string;
  region: string;
  zip: string;
  country: string;
  note: string;
}

export const CONTACT_DEFAULTS: QrContact = {
  first: "",
  last: "",
  title: "",
  mobile: "",
  phone: "",
  email: "",
  site: "",
  org: "Bughaw Innovations Corp.",
  addr: "",
  city: "",
  region: "",
  zip: "",
  country: "Philippines",
  note: "",
};

const t = (v: unknown) => String(v ?? "").trim();

/** Escape a vCard 3.0 text value. */
export function escVCard(v: unknown): string {
  return t(v).replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

export function normalizeUrl(u: string): string {
  const s = t(u);
  if (!s) return "";
  return /^https?:\/\//i.test(s) ? s : "https://" + s.replace(/^\/+/, "");
}

/** Destination URL with an optional `src=` source tag appended. */
export function destinationUrl(dest: string, tag: string): string {
  let u = normalizeUrl(dest);
  if (!u) return "";
  const clean = t(tag).replace(/\s+/g, "-");
  if (clean) u += (u.includes("?") ? "&" : "?") + "src=" + encodeURIComponent(clean);
  return u;
}

export function buildVCard(c: QrContact): string {
  const fn = `${t(c.first)} ${t(c.last)}`.trim();
  const lines = ["BEGIN:VCARD", "VERSION:3.0"];
  lines.push(`N:${escVCard(c.last)};${escVCard(c.first)};;;`);
  lines.push(`FN:${escVCard(fn)}`);
  if (t(c.org)) lines.push(`ORG:${escVCard(c.org)}`);
  if (t(c.title)) lines.push(`TITLE:${escVCard(c.title)}`);
  if (t(c.mobile)) lines.push(`TEL;TYPE=CELL:${t(c.mobile)}`);
  if (t(c.phone)) lines.push(`TEL;TYPE=WORK,VOICE:${t(c.phone)}`);
  if (t(c.email)) lines.push(`EMAIL;TYPE=INTERNET,WORK:${t(c.email)}`);
  if (t(c.site)) lines.push(`URL:${normalizeUrl(c.site)}`);
  if (t(c.addr) || t(c.city) || t(c.region) || t(c.zip) || t(c.country)) {
    lines.push(
      `ADR;TYPE=WORK:;;${escVCard(c.addr)};${escVCard(c.city)};${escVCard(c.region)};${escVCard(c.zip)};${escVCard(c.country)}`
    );
  }
  if (t(c.note)) lines.push(`NOTE:${escVCard(c.note)}`);
  lines.push("END:VCARD");
  return lines.join("\r\n");
}

/** Safe file stem from the person's name. */
export function fileBase(c: Pick<QrContact, "first" | "last">): string {
  const n = `${t(c.first)}-${t(c.last)}`
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9-]/g, "");
  return (n.replace(/^-+|-+$/g, "") || "bughaw-contact").toLowerCase();
}

export interface QrMatrix {
  size: number;
  isDark: (row: number, col: number) => boolean;
}

/** Encode at error-correction H. Returns null when the payload is too large. */
export function makeMatrix(text: string): QrMatrix | null {
  try {
    const qr = QRCode.create(text, { errorCorrectionLevel: "H" });
    return { size: qr.modules.size, isDark: (r, c) => qr.modules.get(r, c) === 1 };
  } catch {
    return null;
  }
}

export const escapeHtml = (v: unknown): string =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Escape for embedding inside an inline <script> block. */
const jsStr = (v: unknown) => JSON.stringify(String(v ?? "")).replace(/</g, "\\u003c");

/** Only allow data: images / https URLs into href/src attributes. */
const safeSrc = (s: string) => (/^(data:image\/|https:\/\/|\/)/i.test(s) ? s : "");

/** Self-contained branded landing page (single HTML file) for the scan destination. */
export function buildLandingPage(c: QrContact, logoSrc: string): string {
  const src = escapeHtml(safeSrc(logoSrc));
  const fn = `${t(c.first)} ${t(c.last)}`.trim() || "Bughaw Innovations";
  const org = t(c.org) || "Bughaw Innovations Corp.";
  const title = t(c.title);
  const note = t(c.note);
  const site = normalizeUrl(c.site);
  const mobile = t(c.mobile);
  const phone = t(c.phone);
  const email = t(c.email);
  const addr = [c.addr, c.city, c.region, c.zip, c.country].map(t).filter(Boolean).join(", ");
  const tel = (n: string) => escapeHtml(n.replace(/[^\d+]/g, ""));

  let links = "";
  if (mobile) links += `<a class="act primary" href="tel:${tel(mobile)}"><span>Call</span><b>${escapeHtml(mobile)}</b></a>`;
  if (phone && !mobile) links += `<a class="act primary" href="tel:${tel(phone)}"><span>Call</span><b>${escapeHtml(phone)}</b></a>`;
  if (email) links += `<a class="act" href="mailto:${escapeHtml(email)}"><span>Email</span><b>${escapeHtml(email)}</b></a>`;
  if (site) links += `<a class="act" href="${escapeHtml(site)}" target="_blank" rel="noopener"><span>Website</span><b>${escapeHtml(site.replace(/^https?:\/\//, ""))}</b></a>`;
  if (phone && mobile) links += `<a class="act" href="tel:${tel(phone)}"><span>Office</span><b>${escapeHtml(phone)}</b></a>`;
  if (addr) links += `<a class="act" href="https://maps.google.com/?q=${encodeURIComponent(addr)}" target="_blank" rel="noopener"><span>Visit</span><b>${escapeHtml(addr)}</b></a>`;

  const css = `:root{--forest:#3E8829;--deep:#074C39;--sea:#1B74AE;--navy:#043871;--sun:#F2B233}
*{box-sizing:border-box}html,body{margin:0;padding:0}
body{min-height:100vh;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#fff;background:linear-gradient(168deg,var(--deep) 0%,var(--forest) 22%,var(--sea) 62%,var(--navy) 100%);background-attachment:fixed;display:flex;justify-content:center;padding:28px 18px 44px}
.card{width:100%;max-width:430px}
.sunwrap{display:flex;justify-content:center;margin-bottom:18px}
.mark{width:112px;height:112px;border-radius:50%;background:#fff;padding:9px;box-shadow:0 0 0 3px rgba(242,178,51,.85),0 18px 40px rgba(0,0,0,.28)}
.mark img{width:100%;height:100%;object-fit:contain;border-radius:50%;display:block}
h1{font-family:Georgia,"Iowan Old Style",serif;font-weight:400;font-size:31px;line-height:1.15;letter-spacing:-.02em;text-align:center;margin:0 0 6px}
.role{text-align:center;color:rgba(255,255,255,.82);font-size:14px;margin:0}
.org{text-align:center;font-size:11px;letter-spacing:.2em;text-transform:uppercase;font-weight:700;color:var(--sun);margin:12px 0 0}
.note{text-align:center;color:rgba(255,255,255,.78);font-size:14px;line-height:1.6;margin:18px auto 0;max-width:34ch}
.rule{height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.35),transparent);margin:26px 0}
.acts{display:grid;gap:10px}
.act{display:flex;flex-direction:column;gap:2px;text-decoration:none;color:#fff;background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.16);border-radius:14px;padding:13px 16px;transition:background .15s,transform .12s}
.act:hover{background:rgba(255,255,255,.18)}.act:active{transform:translateY(1px)}
.act span{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.65);font-weight:700}
.act b{font-weight:600;font-size:15px;word-break:break-word}
.act.primary{background:var(--sun);border-color:var(--sun);color:#3A2400}
.act.primary span{color:rgba(58,36,0,.65)}
#save{width:100%;font:inherit;font-size:15px;font-weight:700;color:var(--navy);background:#fff;border:0;border-radius:14px;padding:15px;cursor:pointer;margin-top:16px;box-shadow:0 10px 26px rgba(0,0,0,.22)}
a:focus-visible,button:focus-visible{outline:3px solid var(--sun);outline-offset:3px}
footer{text-align:center;font-size:11px;color:rgba(255,255,255,.6);margin-top:30px;line-height:1.7}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}`;

  const script = `var VCARD = ${jsStr(buildVCard(c))};
document.getElementById("save").addEventListener("click", function(){
  var blob = new Blob([VCARD], {type:"text/vcard;charset=utf-8"});
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url; a.download = ${jsStr(fileBase(c) + ".vcf")};
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function(){ URL.revokeObjectURL(url); }, 1500);
  this.textContent = "Contact downloaded";
});`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(fn)} — ${escapeHtml(org)}</title>
<meta name="description" content="${escapeHtml(note || org + " — contact card")}">
<meta property="og:title" content="${escapeHtml(fn)} — ${escapeHtml(org)}">
<meta property="og:description" content="${escapeHtml(note || "Tap to call, email, or save the contact.")}">
<link rel="icon" href="${src}">
<style>
${css}
</style>
</head>
<body>
<main class="card">
<div class="sunwrap"><div class="mark"><img src="${src}" alt="${escapeHtml(org)} logo"></div></div>
<h1>${escapeHtml(fn)}</h1>
${title ? `<p class="role">${escapeHtml(title)}</p>\n` : ""}<p class="org">${escapeHtml(org)}</p>
${note ? `<p class="note">${escapeHtml(note)}</p>\n` : ""}<div class="rule"></div>
<div class="acts">${links}</div>
<button id="save">Save to contacts</button>
<footer>${escapeHtml(org)}<br>Scanned from a Bughaw card</footer>
</main>
<script>
${script}
</script>
</body>
</html>`;
}
