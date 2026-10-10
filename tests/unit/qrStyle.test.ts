import { describe, expect, it } from "vitest";
import QRCode from "qrcode";
import {
  DEFAULT_QR_STYLE,
  LOGO_SIZE_MAX,
  LOGO_SIZE_MIN,
  buildQrModel,
  modulesPath,
  normalizeQrStyle,
  qrCaption,
  type QrStyle,
} from "@/lib/qrStyle";
import { emptyCardDraft, normalizeCard, toPublicCard } from "@/lib/cards";

const URL = "https://suite.bughawinnovations.ph/c/Ab3dEf6hIj9K?s=qr";

function style(overrides: Partial<QrStyle> = {}): QrStyle {
  return { ...DEFAULT_QR_STYLE, ...overrides };
}

describe("normalizeQrStyle", () => {
  it("returns the defaults for missing or malformed input", () => {
    expect(normalizeQrStyle(undefined)).toEqual(DEFAULT_QR_STYLE);
    expect(normalizeQrStyle(null)).toEqual(DEFAULT_QR_STYLE);
    expect(normalizeQrStyle("dawn")).toEqual(DEFAULT_QR_STYLE);
    expect(normalizeQrStyle([1, 2])).toEqual(DEFAULT_QR_STYLE);
  });

  it("keeps valid values and drops invalid ones field by field", () => {
    expect(
      normalizeQrStyle({ theme: "grove", rounded: false, logo: "yes", sunRing: false, logoSize: 24, extra: 1 })
    ).toEqual({ theme: "grove", rounded: false, logo: true, sunRing: false, logoSize: 24 });
    expect(normalizeQrStyle({ theme: "neon" }).theme).toBe("dawn");
  });

  it("clamps and rounds the logo size, rejecting non-finite values", () => {
    expect(normalizeQrStyle({ logoSize: 99 }).logoSize).toBe(LOGO_SIZE_MAX);
    expect(normalizeQrStyle({ logoSize: 1 }).logoSize).toBe(LOGO_SIZE_MIN);
    expect(normalizeQrStyle({ logoSize: 19.6 }).logoSize).toBe(20);
    expect(normalizeQrStyle({ logoSize: Number.NaN }).logoSize).toBe(20);
    expect(normalizeQrStyle({ logoSize: Infinity }).logoSize).toBe(20);
  });
});

describe("buildQrModel", () => {
  const reference = QRCode.create(URL, { errorCorrectionLevel: "H" });
  const size = reference.modules.size;
  const dark = (c: number, r: number) => reference.modules.data[r * size + c] === 1;

  it("encodes the URL unchanged at error correction H", () => {
    const model = buildQrModel(URL, style({ logo: false }));
    expect(model.size).toBe(size);
    expect(qrCaption(model)).toBe(`${size}×${size} modules · error correction H`);
    // Every drawn module is dark in the reference matrix.
    for (const [c, r] of model.modules) expect(dark(c, r)).toBe(true);
  });

  it("draws every dark data module outside the finders when the logo is off", () => {
    const model = buildQrModel(URL, style({ logo: false }));
    let expected = 0;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const inFinder =
          (c < 7 && r < 7) || (c >= size - 7 && r < 7) || (c < 7 && r >= size - 7);
        if (dark(c, r) && !inFinder) expected++;
      }
    }
    expect(model.modules).toHaveLength(expected);
    expect(model.logo).toBeNull();
    expect(model.finders).toEqual([
      [0, 0],
      [size - 7, 0],
      [0, size - 7],
    ]);
  });

  it("clears a centred square for the logo, sized by logoSize", () => {
    const small = buildQrModel(URL, style({ logoSize: LOGO_SIZE_MIN }));
    const big = buildQrModel(URL, style({ logoSize: LOGO_SIZE_MAX }));
    expect(big.logo!.size).toBeGreaterThan(small.logo!.size);
    expect(big.logo!.x + big.logo!.size / 2).toBeCloseTo(size / 2);
    for (const [c, r] of big.modules) {
      const inside =
        c + 1 > big.logo!.x && c < big.logo!.x + big.logo!.size && r + 1 > big.logo!.y && r < big.logo!.y + big.logo!.size;
      expect(inside).toBe(false);
    }
    expect(big.modules.length).toBeLessThan(small.modules.length);
  });

  it("keeps the largest logo well inside H's 30% recovery budget", () => {
    const model = buildQrModel(URL, style({ logoSize: LOGO_SIZE_MAX }));
    const cleared = (model.logo!.size + 1) ** 2;
    expect(cleared / (size * size)).toBeLessThan(0.12);
  });

  it("emits one path command per module for dots and squares", () => {
    const model = buildQrModel(URL, style());
    expect(modulesPath(model, true).match(/M/g)).toHaveLength(model.modules.length);
    expect(modulesPath(model, false).match(/M/g)).toHaveLength(model.modules.length);
    expect(modulesPath(model, false)).not.toContain("NaN");
  });
});

describe("qr_style on cards", () => {
  it("defaults new drafts to Dawn and exposes the style publicly", () => {
    const draft = { ...emptyCardDraft(), full_name: "Maria Santos" };
    expect(draft.qr_style).toEqual(DEFAULT_QR_STYLE);
    expect(toPublicCard(draft).qr_style).toEqual(DEFAULT_QR_STYLE);
  });

  it("normalizes the style before saving", () => {
    const draft = {
      ...emptyCardDraft(),
      full_name: "Maria Santos",
      qr_style: { theme: "ink", logoSize: 500 } as unknown as QrStyle,
    };
    expect(normalizeCard(draft).qr_style).toEqual({ ...DEFAULT_QR_STYLE, theme: "ink", logoSize: LOGO_SIZE_MAX });
  });
});
