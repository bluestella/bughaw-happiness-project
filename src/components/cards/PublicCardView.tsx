import {
  Briefcase,
  Camera,
  Download,
  Globe,
  Mail,
  MessageCircle,
  Phone,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import {
  COMPANY_NAME,
  COMPANY_WEBSITE,
  cardPath,
  dialableNumber,
  firstName,
  viberLink,
  type ClickTarget,
  type PublicCard,
} from "@/lib/cards";
import { normalizeQrStyle } from "@/lib/qrStyle";
import { cn } from "@/lib/cn";
import { StyledQr } from "./StyledQr";
import { CardIdentity, SunDivider, primaryGradientButton, secondaryButton } from "./CardParts";

type Row = { target: ClickTarget; icon: LucideIcon; label: string; value: string; href: string };

/**
 * The public digital business card. Presentational only — no hooks, no data
 * access — so the admin editor renders the exact same markup as a live preview
 * (`preview`), with links and downloads inert.
 *
 * Layout follows the QR-card pattern: a white rounded card with the styled QR
 * (display only — never downloadable here), the name block and the sun divider,
 * then contact, links and company panels. Filipino display copy in the serif,
 * operational English in the sans. Anchors carry `data-track` so
 * CardClickTracker can count clicks.
 */
export function PublicCardView({
  card,
  qrValue,
  preview = false,
  source,
  wallet = { apple: false, google: false },
}: {
  card: PublicCard;
  /** Absolute card URL the QR encodes (cardUrl(base, token, "qr")). */
  qrValue: string;
  preview?: boolean;
  /** Attribution passed through to downloads (?s=qr etc.). */
  source?: string;
  wallet?: { apple: boolean; google: boolean };
}) {
  const base = cardPath(card.token);
  const qs = source && source !== "link" ? `?s=${source}` : "";
  const qrStyle = normalizeQrStyle(card.qr_style);

  const contact: Row[] = [];
  if (card.email) {
    contact.push({ target: "email", icon: Mail, label: "Email", value: card.email, href: `mailto:${card.email}` });
  }
  if (card.phone) {
    contact.push({
      target: "phone",
      icon: Phone,
      label: "Mobile",
      value: card.phone,
      href: `tel:${dialableNumber(card.phone)}`,
    });
    if (card.phone_on_viber) {
      contact.push({
        target: "viber",
        icon: MessageCircle,
        label: "Viber",
        value: "Message on Viber",
        href: viberLink(card.phone),
      });
    }
  }

  const links: Row[] = [];
  if (card.linkedin_url) {
    links.push({ target: "linkedin", icon: Briefcase, label: "LinkedIn", value: "Profile", href: card.linkedin_url });
  }
  if (card.facebook_url) {
    links.push({ target: "facebook", icon: Users, label: "Facebook", value: "Page", href: card.facebook_url });
  }
  if (card.instagram_url) {
    links.push({ target: "instagram", icon: Camera, label: "Instagram", value: "Profile", href: card.instagram_url });
  }
  if (card.website_url) {
    links.push({
      target: "website",
      icon: Globe,
      label: "Website",
      value: card.website_url.replace(/^https:\/\//, "").replace(/\/$/, ""),
      href: card.website_url,
    });
  }

  const name = card.full_name || "Your name";
  // Inside the admin page the preview must not add a second <main>/<h1>.
  const Main = preview ? "div" : "main";

  return (
    <div className={cn("bg-frost px-4", preview ? "py-5" : "min-h-screen py-6 sm:py-10")}>
      <Main
        {...(preview ? {} : { id: "main-content", tabIndex: -1 })}
        className="mx-auto w-full max-w-[460px] space-y-4 outline-none"
      >
        {/* QR card */}
        <article className="rounded-[28px] border border-line/80 bg-white px-6 pb-7 pt-8 sm:px-8">
          <StyledQr
            id={preview ? "preview-qr" : "card-qr"}
            value={qrValue}
            qrStyle={qrStyle}
            title={`QR code for ${name}'s digital card`}
            className="mx-auto block w-full max-w-[280px] select-none"
          />

          {card.photo_url && (
            // Admin-supplied https URL on any host, so next/image's allowlist can't apply.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={card.photo_url}
              alt={`Photo of ${name}`}
              width={64}
              height={64}
              referrerPolicy="no-referrer"
              className="mx-auto mt-6 h-16 w-16 rounded-full border border-line object-cover"
            />
          )}

          <CardIdentity
            name={name}
            title={card.job_title}
            as={preview ? "p" : "h1"}
            className={card.photo_url ? "mt-3" : "mt-7"}
          />

          <SunDivider className="mt-6" />

          <div className="mt-5 text-center">
            <p className="font-display text-[20px] leading-snug text-deep">Ikinagagalak kitang makilala.</p>
            <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-soft">
              Pleased to meet you
            </p>
          </div>
          {card.bio && <p className="mt-3 text-center text-[15px] leading-relaxed text-ink">{card.bio}</p>}

          <div className="mt-6 space-y-3">
            {preview ? (
              <span className={cn(primaryGradientButton, "cursor-default")}>
                <Download className="h-4 w-4" aria-hidden />
                Save contact
              </span>
            ) : (
              <a href={`${base}/vcard${qs}`} className={primaryGradientButton}>
                <Download className="h-4 w-4" aria-hidden />
                Save contact
              </a>
            )}
            {(wallet.apple || wallet.google) && (
              <div className="grid grid-cols-2 gap-3">
                {wallet.apple && (
                  <a href={preview ? undefined : `${base}/wallet/apple${qs}`} className={secondaryButton}>
                    <Wallet className="h-4 w-4" aria-hidden />
                    Apple Wallet
                  </a>
                )}
                {wallet.google && (
                  <a href={preview ? undefined : `${base}/wallet/google${qs}`} className={secondaryButton}>
                    <Wallet className="h-4 w-4" aria-hidden />
                    Google Wallet
                  </a>
                )}
              </div>
            )}
          </div>
        </article>

        {contact.length > 0 && <LinkList title="Contact" rows={contact} preview={preview} />}
        {links.length > 0 && <LinkList title="Find me online" rows={links} preview={preview} external />}

        {(card.company_blurb || card.cta_url) && (
          <section className="rounded-[22px] border border-line/80 bg-white px-6 py-5">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-soft">
              About {COMPANY_NAME}
            </h2>
            {card.company_blurb && (
              <p className="mt-2 text-[14.5px] leading-relaxed text-ink">{card.company_blurb}</p>
            )}
            {card.cta_url && card.cta_label && (
              <a
                href={preview ? undefined : card.cta_url}
                target="_blank"
                rel="noopener noreferrer"
                data-track="cta"
                className="mt-4 inline-flex items-center rounded-full border border-coir bg-coir-bg px-4 py-2 text-[14px] font-semibold text-coir-dark transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-coir/40"
              >
                {card.cta_label} →
              </a>
            )}
          </section>
        )}

        <footer className="px-2 pb-2 text-center text-[12px] leading-relaxed text-ink-soft">
          <p>
            {COMPANY_NAME} Corporation · Philippines ·{" "}
            <a
              href={preview ? undefined : COMPANY_WEBSITE}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-coir-dark underline decoration-gold underline-offset-2"
            >
              bughawinnovations.ph
            </a>
          </p>
          <p className="mt-1">This card shows only what {firstName(name) || "this person"} chose to publish.</p>
        </footer>
      </Main>
    </div>
  );
}

function LinkList({
  title,
  rows,
  preview,
  external = false,
}: {
  title: string;
  rows: Row[];
  preview: boolean;
  external?: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-[22px] border border-line/80 bg-white">
      <h2 className="px-6 pb-1 pt-4 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-soft">{title}</h2>
      <ul className="divide-y divide-line/70">
        {rows.map((row) => {
          const Icon = row.icon;
          return (
            <li key={row.target}>
              <a
                href={preview ? undefined : row.href}
                data-track={row.target}
                {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className="flex items-center gap-3.5 px-6 py-3.5 transition-colors hover:bg-frost focus:outline-none focus-visible:bg-coir-bg"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-coir-bg">
                  <Icon className="h-[17px] w-[17px] text-coir-dark" strokeWidth={1.75} aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-soft">
                    {row.label}
                  </span>
                  <span className="block truncate text-[15px] text-ink">{row.value}</span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
