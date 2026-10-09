// Apple / Google Wallet passes for digital business cards. SERVER-ONLY: this
// module reads the app's only non-public secrets and must be imported solely
// from route handlers under src/app/c/[token]/wallet/. See docs/security.md §4
// and .env.example. Every function degrades to "not configured" when its env
// vars are missing — the public page then simply hides the wallet buttons.

import { createSign } from "node:crypto";
import { COMPANY_NAME, type PublicCard } from "@/lib/cards";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Env values are stored with literal "\n" in Vercel; restore real newlines. */
function pem(value: string | undefined): string {
  return (value ?? "").replace(/\\n/g, "\n").trim();
}

export type AppleWalletConfig = {
  passTypeIdentifier: string;
  teamIdentifier: string;
  signerCert: string;
  signerKey: string;
  signerKeyPassphrase?: string;
  wwdr: string;
};

export type GoogleWalletConfig = {
  issuerId: string;
  serviceAccountEmail: string;
  privateKey: string;
};

export function appleWalletConfig(env: NodeJS.ProcessEnv = process.env): AppleWalletConfig | null {
  const cfg = {
    passTypeIdentifier: (env.APPLE_PASS_TYPE_ID ?? "").trim(),
    teamIdentifier: (env.APPLE_TEAM_ID ?? "").trim(),
    signerCert: pem(env.APPLE_PASS_CERT_PEM),
    signerKey: pem(env.APPLE_PASS_KEY_PEM),
    signerKeyPassphrase: env.APPLE_PASS_KEY_PASSPHRASE || undefined,
    wwdr: pem(env.APPLE_WWDR_CERT_PEM),
  };
  return cfg.passTypeIdentifier && cfg.teamIdentifier && cfg.signerCert && cfg.signerKey && cfg.wwdr
    ? cfg
    : null;
}

export function googleWalletConfig(env: NodeJS.ProcessEnv = process.env): GoogleWalletConfig | null {
  const cfg = {
    issuerId: (env.GOOGLE_WALLET_ISSUER_ID ?? "").trim(),
    serviceAccountEmail: (env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL ?? "").trim(),
    privateKey: pem(env.GOOGLE_WALLET_PRIVATE_KEY),
  };
  return /^[0-9]+$/.test(cfg.issuerId) && cfg.serviceAccountEmail && cfg.privateKey ? cfg : null;
}

// ---------------------------------------------------------------------------
// Google Wallet — "Save to Google Wallet" link = a signed JWT carrying a
// generic pass class + object inline (no Wallet API call needed).
// ---------------------------------------------------------------------------

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

export function signJwtRS256(payload: Record<string, unknown>, privateKeyPem: string): string {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${body}`);
  signer.end();
  return `${header}.${body}.${signer.sign(privateKeyPem).toString("base64url")}`;
}

export function googleWalletPayload(
  card: PublicCard,
  opts: { config: GoogleWalletConfig; cardUrl: string; origin: string; logoUrl: string; iat: number }
): Record<string, unknown> {
  const { issuerId, serviceAccountEmail } = opts.config;
  const classId = `${issuerId}.bughaw_business_card`;
  const text = (value: string) => ({ defaultValue: { language: "en-US", value } });
  const textModules = [
    card.email ? { id: "email", header: "Email", body: card.email } : null,
    card.phone ? { id: "phone", header: "Mobile", body: card.phone } : null,
  ].filter(Boolean);

  return {
    iss: serviceAccountEmail,
    aud: "google",
    typ: "savetowallet",
    iat: opts.iat,
    origins: [opts.origin],
    payload: {
      genericClasses: [{ id: classId }],
      genericObjects: [
        {
          id: `${issuerId}.card_${card.token}`,
          classId,
          state: "ACTIVE",
          hexBackgroundColor: "#1D5C13",
          logo: { sourceUri: { uri: opts.logoUrl }, contentDescription: text(COMPANY_NAME) },
          cardTitle: text(COMPANY_NAME),
          header: text(card.full_name),
          ...(card.job_title ? { subheader: text(card.job_title) } : {}),
          textModulesData: textModules,
          barcode: { type: "QR_CODE", value: opts.cardUrl, alternateText: "Scan for my digital card" },
          linksModuleData: {
            uris: [{ uri: opts.cardUrl, description: "Digital business card", id: "card" }],
          },
        },
      ],
    },
  };
}

export function googleWalletSaveUrl(jwt: string): string {
  return `https://pay.google.com/gp/v/save/${jwt}`;
}

// ---------------------------------------------------------------------------
// Apple Wallet — a signed .pkpass (generic style)
// ---------------------------------------------------------------------------

export async function buildApplePass(
  card: PublicCard,
  opts: { config: AppleWalletConfig; cardUrl: string; icon: Buffer; logo: Buffer }
): Promise<Buffer> {
  const { PKPass } = await import("passkit-generator");
  const { config } = opts;

  const pass = new PKPass(
    {
      "icon.png": opts.icon,
      "icon@2x.png": opts.icon,
      "logo.png": opts.logo,
      "logo@2x.png": opts.logo,
    },
    {
      wwdr: config.wwdr,
      signerCert: config.signerCert,
      signerKey: config.signerKey,
      signerKeyPassphrase: config.signerKeyPassphrase,
    },
    {
      formatVersion: 1,
      passTypeIdentifier: config.passTypeIdentifier,
      teamIdentifier: config.teamIdentifier,
      serialNumber: `card-${card.token}`,
      organizationName: COMPANY_NAME,
      description: `${card.full_name} — ${COMPANY_NAME}`,
      logoText: COMPANY_NAME,
      // Brand dark field (Deep Green) with light text — 8.1:1.
      backgroundColor: "rgb(29, 92, 19)",
      foregroundColor: "rgb(255, 255, 255)",
      labelColor: "rgb(232, 232, 232)",
    }
  );

  pass.type = "generic";
  pass.primaryFields.push({ key: "name", label: card.job_title || COMPANY_NAME, value: card.full_name });
  if (card.email) pass.secondaryFields.push({ key: "email", label: "EMAIL", value: card.email });
  if (card.phone) pass.secondaryFields.push({ key: "phone", label: "MOBILE", value: card.phone });
  pass.backFields.push({ key: "card", label: "Digital card", value: opts.cardUrl });
  if (card.bio) pass.backFields.push({ key: "bio", label: "About", value: card.bio });
  pass.setBarcodes({
    message: opts.cardUrl,
    format: "PKBarcodeFormatQR",
    messageEncoding: "iso-8859-1",
    altText: "Scan for my digital card",
  });

  return pass.getAsBuffer();
}
