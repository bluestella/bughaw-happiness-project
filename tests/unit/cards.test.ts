import { describe, expect, it } from "vitest";
import { generateKeyPairSync, createVerify } from "node:crypto";
import {
  BIO_MAX,
  buildEmailSignatureHtml,
  buildVCard,
  cardUrl,
  dayRange,
  deviceFromUserAgent,
  dialableNumber,
  emptyCardDraft,
  escapeHtml,
  initials,
  isBotUserAgent,
  isHttpsUrl,
  isValidCardToken,
  manilaToday,
  normalizeCard,
  parseClickTarget,
  parseSource,
  summarizeCardEvents,
  toPublicCard,
  validateCard,
  vcardFileName,
  viberLink,
  type CardDraft,
  type PublicCard,
  type RollupRow,
} from "@/lib/cards";
import {
  appleWalletConfig,
  googleWalletConfig,
  googleWalletPayload,
  googleWalletSaveUrl,
  signJwtRS256,
} from "@/lib/wallet";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const ANDROID_PHONE =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";
const ANDROID_TABLET =
  "Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const IPAD = "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

function draft(overrides: Partial<CardDraft> = {}): CardDraft {
  return { ...emptyCardDraft(), full_name: "Maria Santos", ...overrides };
}

function card(overrides: Partial<PublicCard> = {}): PublicCard {
  return { ...toPublicCard(draft()), token: "Ab3dEf6hIj9K", ...overrides };
}

describe("tokens and URLs", () => {
  it("accepts only 12-char base62 tokens", () => {
    expect(isValidCardToken("Ab3dEf6hIj9K")).toBe(true);
    expect(isValidCardToken("Ab3dEf6hIj9")).toBe(false);
    expect(isValidCardToken("Ab3dEf6hIj9K1")).toBe(false);
    expect(isValidCardToken("Ab3dEf6hIj9-")).toBe(false);
    expect(isValidCardToken("../../etc/pw")).toBe(false);
    expect(isValidCardToken(null)).toBe(false);
  });

  it("builds share URLs with an attribution source", () => {
    expect(cardUrl("https://suite.example.ph/", "Ab3dEf6hIj9K")).toBe("https://suite.example.ph/c/Ab3dEf6hIj9K");
    expect(cardUrl("https://suite.example.ph", "Ab3dEf6hIj9K", "qr")).toBe(
      "https://suite.example.ph/c/Ab3dEf6hIj9K?s=qr"
    );
    expect(cardUrl("https://suite.example.ph", "Ab3dEf6hIj9K", "link")).toBe(
      "https://suite.example.ph/c/Ab3dEf6hIj9K"
    );
  });

  it("falls back to 'link' for unknown sources and rejects unknown click targets", () => {
    expect(parseSource("qr")).toBe("qr");
    expect(parseSource("nfc")).toBe("nfc");
    expect(parseSource("preview")).toBe("link");
    expect(parseSource(null)).toBe("link");
    expect(parseClickTarget("linkedin")).toBe("linkedin");
    expect(parseClickTarget("javascript:alert(1)")).toBeNull();
    expect(parseClickTarget(42)).toBeNull();
  });

  it("only treats real https URLs as https", () => {
    expect(isHttpsUrl("https://bughawinnovations.ph/for-hotels")).toBe(true);
    expect(isHttpsUrl("http://bughawinnovations.ph")).toBe(false);
    expect(isHttpsUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpsUrl("https://localhost")).toBe(false);
    expect(isHttpsUrl(`https://a.ph/${"x".repeat(500)}`)).toBe(false);
  });
});

describe("validateCard", () => {
  it("accepts the default draft once a name is set", () => {
    expect(validateCard(draft())).toEqual({});
  });

  it("requires a name", () => {
    expect(validateCard(draft({ full_name: "   " })).full_name).toBeDefined();
  });

  it("caps the bio at 150 characters", () => {
    expect(validateCard(draft({ bio: "x".repeat(BIO_MAX) })).bio).toBeUndefined();
    expect(validateCard(draft({ bio: "x".repeat(BIO_MAX + 1) })).bio).toBeDefined();
  });

  it("rejects non-https links, including javascript: URLs", () => {
    const errors = validateCard(
      draft({ linkedin_url: "javascript:alert(1)", photo_url: "http://x.ph/a.jpg", cta_url: "ftp://x.ph" })
    );
    expect(errors.linkedin_url).toBeDefined();
    expect(errors.photo_url).toBeDefined();
    expect(errors.cta_url).toBeDefined();
  });

  it("needs a number when the phone is shown, and only phone characters", () => {
    expect(validateCard(draft({ show_phone: true, phone: "" })).phone).toBeDefined();
    expect(validateCard(draft({ phone: "0917<script>" })).phone).toBeDefined();
    expect(validateCard(draft({ phone: "+63 (917) 123-4567", show_phone: true })).phone).toBeUndefined();
  });

  it("requires the CTA label and link together", () => {
    expect(validateCard(draft({ cta_label: "Book", cta_url: "" })).cta_url).toBeDefined();
    expect(validateCard(draft({ cta_label: "", cta_url: "" })).cta_url).toBeUndefined();
  });

  it("validates email format", () => {
    expect(validateCard(draft({ email: "not-an-email" })).email).toBeDefined();
    expect(validateCard(draft({ email: "maria@bughawinnovations.ph" })).email).toBeUndefined();
  });
});

describe("normalizeCard / toPublicCard", () => {
  it("trims, lower-cases emails, and drops Viber when the phone is hidden", () => {
    const n = normalizeCard(
      draft({
        full_name: "  Maria Santos ",
        email: " Maria@Bughaw.PH ",
        owner_email: "MARIA@X.PH",
        phone_on_viber: true,
        show_phone: false,
      })
    );
    expect(n.full_name).toBe("Maria Santos");
    expect(n.email).toBe("maria@bughaw.ph");
    expect(n.owner_email).toBe("maria@x.ph");
    expect(n.phone_on_viber).toBe(false);
  });

  it("never exposes a hidden phone number in the public shape", () => {
    const hidden = toPublicCard(draft({ phone: "+639171234567", show_phone: false, phone_on_viber: true }));
    expect(hidden.phone).toBe("");
    expect(hidden.phone_on_viber).toBe(false);
    const shown = toPublicCard(draft({ phone: "+639171234567", show_phone: true, phone_on_viber: true }));
    expect(shown.phone).toBe("+639171234567");
    expect(shown.phone_on_viber).toBe(true);
    expect(Object.keys(shown)).not.toContain("owner_email");
    expect(Object.keys(shown)).not.toContain("status");
  });
});

describe("request parsing", () => {
  it("classifies devices", () => {
    expect(deviceFromUserAgent(IPHONE)).toBe("mobile");
    expect(deviceFromUserAgent(ANDROID_PHONE)).toBe("mobile");
    expect(deviceFromUserAgent(ANDROID_TABLET)).toBe("tablet");
    expect(deviceFromUserAgent(IPAD)).toBe("tablet");
    expect(deviceFromUserAgent(MAC)).toBe("desktop");
    expect(deviceFromUserAgent(WINDOWS)).toBe("desktop");
    expect(deviceFromUserAgent("")).toBe("unknown");
    expect(deviceFromUserAgent(null)).toBe("unknown");
  });

  it("filters crawlers and link-preview fetchers, not real browsers", () => {
    expect(isBotUserAgent("facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)")).toBe(true);
    expect(isBotUserAgent("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(true);
    expect(isBotUserAgent("Slackbot-LinkExpanding 1.0")).toBe(true);
    expect(isBotUserAgent("TelegramBot (like TwitterBot)")).toBe(true);
    expect(isBotUserAgent("curl/8.4.0")).toBe(true);
    expect(isBotUserAgent(undefined)).toBe(true);
    expect(isBotUserAgent(IPHONE)).toBe(false);
    expect(isBotUserAgent(WINDOWS)).toBe(false);
  });

  it("makes dialable numbers and Viber links", () => {
    expect(dialableNumber("+63 (917) 123-4567")).toBe("+639171234567");
    expect(dialableNumber("0917 123 4567")).toBe("09171234567");
    expect(viberLink("+63 917 123 4567")).toBe("viber://chat?number=%2B639171234567");
  });

  it("derives initials", () => {
    expect(initials("Maria Clara Santos")).toBe("MS");
    expect(initials("Juan")).toBe("J");
    expect(initials("  ")).toBe("B");
  });
});

describe("buildVCard", () => {
  it("emits a CRLF vCard 3.0 with escaped values", () => {
    const vcf = buildVCard(
      card({ job_title: "Sales; Partnerships, PH", bio: "Line one\nline two", email: "maria@bughaw.ph" }),
      "https://suite.example.ph/c/Ab3dEf6hIj9K"
    );
    expect(vcf.startsWith("BEGIN:VCARD\r\nVERSION:3.0\r\n")).toBe(true);
    expect(vcf.endsWith("END:VCARD\r\n")).toBe(true);
    expect(vcf).toContain("N:Santos;Maria;;;");
    expect(vcf).toContain("FN:Maria Santos");
    expect(vcf).toContain("ORG:Bughaw Innovations");
    expect(vcf).toContain("TITLE:Sales\\; Partnerships\\, PH");
    expect(vcf).toContain("NOTE:Line one\\nline two");
    expect(vcf).toContain("EMAIL;TYPE=INTERNET,WORK:maria@bughaw.ph");
    expect(vcf).not.toMatch(/[^\r]\n/);
  });

  it("omits the phone when the card does not expose one", () => {
    expect(buildVCard(card({ phone: "" }), "https://x.ph/c/a")).not.toContain("TEL");
    expect(buildVCard(card({ phone: "+63 917 123 4567" }), "https://x.ph/c/a")).toContain(
      "TEL;TYPE=CELL:+639171234567"
    );
  });

  it("folds long lines at 75 characters", () => {
    const vcf = buildVCard(card({ bio: "x".repeat(150) }), "https://x.ph/c/a");
    for (const line of vcf.split("\r\n")) expect(line.length).toBeLessThanOrEqual(75);
  });

  it("makes safe file names", () => {
    expect(vcardFileName("María Dela Cruz")).toBe("maria-dela-cruz.vcf");
    expect(vcardFileName('"; rm -rf /')).toBe("rm-rf.vcf");
    expect(vcardFileName("***")).toBe("contact.vcf");
  });
});

describe("email signature", () => {
  it("escapes every field so card data cannot inject markup", () => {
    const html = buildEmailSignatureHtml(
      { full_name: '<img src=x onerror="alert(1)">', job_title: "A & B", email: "a@b.ph", phone: "" },
      { cardUrl: 'https://x.ph/c/a?s=email"><script>', logoUrl: "https://x.ph/brand/logo-mark.png" }
    );
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).toContain("A &amp; B");
    expect(escapeHtml(`'"<>&`)).toBe("&#39;&quot;&lt;&gt;&amp;");
  });
});

describe("analytics", () => {
  it("builds an oldest-first day range across month boundaries", () => {
    expect(dayRange("2026-03-02", 3)).toEqual(["2026-02-28", "2026-03-01", "2026-03-02"]);
    expect(dayRange("2026-01-01", 0)).toEqual(["2026-01-01"]);
    expect(dayRange("2026-01-01", Number.NaN)).toEqual(["2026-01-01"]);
  });

  it("uses Manila (UTC+8) for today", () => {
    expect(manilaToday(new Date("2026-10-09T16:30:00Z"))).toBe("2026-10-10");
    expect(manilaToday(new Date("2026-10-09T15:59:00Z"))).toBe("2026-10-09");
  });

  const rows: RollupRow[] = [
    { card_id: "a", day: "2026-10-09", event: "view", target: null, source: "qr", device: "mobile", n: 8 },
    { card_id: "a", day: "2026-10-08", event: "view", target: null, source: "link", device: "desktop", n: 2 },
    { card_id: "a", day: "2026-10-09", event: "save_contact", target: null, source: "qr", device: "mobile", n: 3 },
    { card_id: "a", day: "2026-10-09", event: "click", target: "linkedin", source: "qr", device: "mobile", n: 4 },
    { card_id: "b", day: "2026-10-09", event: "wallet_apple", target: null, source: "link", device: "mobile", n: 1 },
    { card_id: "b", day: "2026-10-09", event: "click", target: "cta", source: "link", device: "mobile", n: 2 },
    // Outside a 7-day window ending 2026-10-09:
    { card_id: "a", day: "2026-09-01", event: "view", target: null, source: "nfc", device: "mobile", n: 50 },
  ];

  it("totals events inside the window and computes the save rate", () => {
    const s = summarizeCardEvents(rows, { today: "2026-10-09", days: 7 });
    expect(s.totals).toEqual({ views: 10, saves: 3, clicks: 6, wallet: 1, saveRate: 0.3 });
    expect(s.days).toHaveLength(7);
    expect(s.daily.views.slice(-2)).toEqual([2, 8]);
    expect(s.daily.saves.slice(-1)).toEqual([3]);
    expect(s.bySource).toEqual({ link: 2, qr: 8, nfc: 0, email: 0 });
    expect(s.byDevice).toEqual({ mobile: 8, tablet: 0, desktop: 2, unknown: 0 });
    expect(s.byTarget.linkedin).toBe(4);
    expect(s.byTarget.cta).toBe(2);
    expect(s.perCard.a.saveRate).toBe(0.3);
    expect(s.perCard.b.views).toBe(0);
  });

  it("returns a 0 save rate (not NaN/Infinity) when there are no views", () => {
    const s = summarizeCardEvents(rows, { today: "2026-10-09", days: 7, cardId: "b" });
    expect(s.totals.views).toBe(0);
    expect(s.totals.saveRate).toBe(0);
    expect(s.perCard.b.saveRate).toBe(0);
    expect(Number.isFinite(s.totals.saveRate)).toBe(true);
  });

  it("filters by card and ignores bad counts", () => {
    const s = summarizeCardEvents(
      [...rows, { card_id: "a", day: "2026-10-09", event: "view", target: null, source: "qr", device: "mobile", n: Number.NaN }],
      { today: "2026-10-09", days: 90, cardId: "a" }
    );
    expect(s.totals.views).toBe(60);
    expect(s.perCard.b).toBeUndefined();
  });

  it("handles an empty rollup", () => {
    const s = summarizeCardEvents([], { today: "2026-10-09", days: 30 });
    expect(s.totals).toEqual({ views: 0, saves: 0, clicks: 0, wallet: 0, saveRate: 0 });
    expect(s.daily.views).toHaveLength(30);
  });
});

describe("wallet", () => {
  it("is not configured without env vars", () => {
    expect(appleWalletConfig({} as NodeJS.ProcessEnv)).toBeNull();
    expect(googleWalletConfig({} as NodeJS.ProcessEnv)).toBeNull();
    expect(googleWalletConfig({
      GOOGLE_WALLET_ISSUER_ID: "not-numeric",
      GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL: "x@y.iam.gserviceaccount.com",
      GOOGLE_WALLET_PRIVATE_KEY: "k",
    } as unknown as NodeJS.ProcessEnv)).toBeNull();
  });

  it("restores escaped newlines in PEM env values", () => {
    const cfg = googleWalletConfig({
      GOOGLE_WALLET_ISSUER_ID: "3388000000012345678",
      GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL: "wallet@bughaw.iam.gserviceaccount.com",
      GOOGLE_WALLET_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----",
    } as unknown as NodeJS.ProcessEnv);
    expect(cfg?.privateKey).toBe("-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----");
  });

  it("signs a verifiable RS256 Save-to-Wallet JWT", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const config = {
      issuerId: "3388000000012345678",
      serviceAccountEmail: "wallet@bughaw.iam.gserviceaccount.com",
      privateKey: pem,
    };
    const payload = googleWalletPayload(card(), {
      config,
      cardUrl: "https://suite.example.ph/c/Ab3dEf6hIj9K",
      origin: "https://suite.example.ph",
      logoUrl: "https://suite.example.ph/icons/android-chrome-192x192.png",
      iat: 1_700_000_000,
    });
    const jwt = signJwtRS256(payload, pem);
    const [h, b, sig] = jwt.split(".");
    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${h}.${b}`);
    expect(verifier.verify(publicKey, Buffer.from(sig, "base64url"))).toBe(true);

    const decoded = JSON.parse(Buffer.from(b, "base64url").toString("utf8"));
    expect(decoded.aud).toBe("google");
    expect(decoded.typ).toBe("savetowallet");
    const obj = decoded.payload.genericObjects[0];
    expect(obj.id).toBe("3388000000012345678.card_Ab3dEf6hIj9K");
    expect(obj.barcode.value).toBe("https://suite.example.ph/c/Ab3dEf6hIj9K");
    expect(googleWalletSaveUrl(jwt)).toBe(`https://pay.google.com/gp/v/save/${jwt}`);
  });
});
