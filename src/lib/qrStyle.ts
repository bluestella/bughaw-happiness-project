// Styled QR codes for digital business cards — pure config + geometry.
//
// The QR *content* never changes here (it is always the card link,
// cardUrl(..., "qr")). This module only decides how the matrix is drawn:
// colour theme, rounded vs square modules, the Bughaw logo in the centre, the
// gold "sun ring" around it, and the logo size. The admin sets a QrStyle per
// card (business_cards.qr_style, migration 0010); the public page renders the
// same style read-only.
//
// The vocabulary MIRRORS the qr_style check constraint in
// supabase/migrations/0010_card_qr_style.sql — change the SQL first.

import QRCode from "qrcode";

export const QR_THEMES = ["dawn", "ocean", "grove", "ink"] as const;
export type QrTheme = (typeof QR_THEMES)[number];

export type QrStyle = {
  theme: QrTheme;
  rounded: boolean;
  logo: boolean;
  sunRing: boolean;
  /** Logo tile width as % of the code's width (excluding quiet zone). */
  logoSize: number;
};

export const LOGO_SIZE_MIN = 12;
export const LOGO_SIZE_MAX = 28;

export const DEFAULT_QR_STYLE: QrStyle = {
  theme: "dawn",
  rounded: true,
  logo: true,
  sunRing: true,
  logoSize: 20,
};

// Brand palette only (tokens.css): Bughaw Green, Bughaw Blue, its dark hover,
// Deep Green, Ink. These are SVG fills, not classNames — like chart colours.
export const QR_THEME_DEF: Record<
  QrTheme,
  { label: string; stops: ReadonlyArray<readonly [offset: number, color: string]> }
> = {
  dawn: {
    label: "Dawn",
    stops: [
      [0, "#4C8B32"],
      [0.5, "#20699F"],
      [1, "#17517D"],
    ],
  },
  ocean: {
    label: "Ocean",
    stops: [
      [0, "#20699F"],
      [1, "#17517D"],
    ],
  },
  grove: {
    label: "Grove",
    stops: [
      [0, "#4C8B32"],
      [1, "#1D5C13"],
    ],
  },
  ink: {
    label: "Ink",
    stops: [
      [0, "#241F1A"],
      [1, "#241F1A"],
    ],
  },
};

export const SUN_RING_COLOR = "#E5B95F";
/** Small logo for on-screen rendering; the PNG export swaps in a larger one. */
export const QR_LOGO_SRC = "/icons/android-chrome-192x192.png";
export const QR_LOGO_EXPORT_SRC = "/icons/android-chrome-512x512.png";

/** Accepts anything (DB jsonb, form state) and returns a valid style. */
export function normalizeQrStyle(raw: unknown): QrStyle {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const theme = (QR_THEMES as readonly string[]).includes(r.theme as string)
    ? (r.theme as QrTheme)
    : DEFAULT_QR_STYLE.theme;
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  const size =
    typeof r.logoSize === "number" && Number.isFinite(r.logoSize)
      ? Math.round(Math.min(LOGO_SIZE_MAX, Math.max(LOGO_SIZE_MIN, r.logoSize)))
      : DEFAULT_QR_STYLE.logoSize;
  return {
    theme,
    rounded: bool(r.rounded, DEFAULT_QR_STYLE.rounded),
    logo: bool(r.logo, DEFAULT_QR_STYLE.logo),
    sunRing: bool(r.sunRing, DEFAULT_QR_STYLE.sunRing),
    logoSize: size,
  };
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

export type QrModel = {
  /** Modules per side (e.g. 41 for version 6). */
  size: number;
  /** Quiet zone, in modules, on every side. */
  margin: number;
  /** Data modules to draw as [col, row] — finder patterns and the logo area excluded. */
  modules: Array<readonly [number, number]>;
  /** Top-left corners [col, row] of the three 7×7 finder patterns. */
  finders: Array<readonly [number, number]>;
  /** Logo tile in module units (null when the logo is off). */
  logo: { x: number; y: number; size: number } | null;
};

/**
 * Error correction is always H (30% recoverable) so a centre logo never makes
 * the code unreadable. The encoded text is passed through untouched.
 */
export function buildQrModel(text: string, style: QrStyle, margin = 2): QrModel {
  const qr = QRCode.create(text, { errorCorrectionLevel: "H" });
  const size = qr.modules.size;
  const data = qr.modules.data;

  const finders: Array<readonly [number, number]> = [
    [0, 0],
    [size - 7, 0],
    [0, size - 7],
  ];
  const inFinder = (c: number, r: number) =>
    finders.some(([fx, fy]) => c >= fx && c < fx + 7 && r >= fy && r < fy + 7);

  let logo: QrModel["logo"] = null;
  let cleared = (_c: number, _r: number) => false;
  if (style.logo) {
    const tile = (size * normalizeQrStyle(style).logoSize) / 100;
    const start = (size - tile) / 2;
    logo = { x: start, y: start, size: tile };
    // Clear modules touching the tile plus half a module of breathing room.
    const lo = start - 0.5;
    const hi = start + tile + 0.5;
    cleared = (c, r) => c + 1 > lo && c < hi && r + 1 > lo && r < hi;
  }

  const modules: Array<readonly [number, number]> = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!data[r * size + c]) continue;
      if (inFinder(c, r) || cleared(c, r)) continue;
      modules.push([c, r]);
    }
  }
  return { size, margin, modules, finders, logo };
}

const n = (v: number) => Number(v.toFixed(3));

/** One SVG path for every data module (dots or squares), in viewBox units. */
export function modulesPath(model: QrModel, rounded: boolean): string {
  const m = model.margin;
  if (rounded) {
    const rad = 0.43;
    return model.modules
      .map(([c, r]) => {
        const cx = c + m + 0.5;
        const cy = r + m + 0.5;
        return `M${n(cx - rad)} ${n(cy)}a${rad} ${rad} 0 1 0 ${n(2 * rad)} 0a${rad} ${rad} 0 1 0 ${n(-2 * rad)} 0`;
      })
      .join("");
  }
  // Squares overlap by a hair so anti-aliasing never shows seams.
  return model.modules.map(([c, r]) => `M${c + m} ${r + m}h1.02v1.02h-1.02z`).join("");
}

/** How the code renders, e.g. "41×41 modules · error correction H". */
export function qrCaption(model: QrModel): string {
  return `${model.size}×${model.size} modules · error correction H`;
}
