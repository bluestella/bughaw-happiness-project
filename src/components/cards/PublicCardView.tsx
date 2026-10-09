import Image from "next/image";
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
  initials,
  viberLink,
  type ClickTarget,
  type PublicCard,
} from "@/lib/cards";

type Row = { target: ClickTarget; icon: LucideIcon; label: string; value: string; href: string };

/**
 * The public digital business card. Presentational only — no hooks, no data
 * access — so the admin editor can render the exact same markup as a live
 * preview (`preview`), with downloads disabled.
 *
 * Brand mode for an HTML page: Deep Green hero band → cream body → dark footer.
 * Filipino display copy in the serif, operational English in the sans.
 * Anchors carry `data-track` so CardClickTracker can count clicks.
 */
export function PublicCardView({
  card,
  preview = false,
  source,
  wallet = { apple: false, google: false },
}: {
  card: PublicCard;
  preview?: boolean;
  /** Attribution passed through to downloads (?s=qr etc.). */
  source?: string;
  wallet?: { apple: boolean; google: boolean };
}) {
  const base = cardPath(card.token);
  const qs = source && source !== "link" ? `?s=${source}` : "";

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
  const Heading = preview ? "p" : "h1";

  return (
    <div className="mx-auto w-full max-w-[440px] overflow-hidden bg-paper sm:my-8 sm:rounded-[3px] sm:border sm:border-line">
      {/* Hero — Deep Green brand field */}
      <header className="bg-deep px-6 pb-8 pt-6 text-white">
        <div className="flex items-center gap-2.5">
          <Image src="/brand/logo-mark.png" alt="" width={28} height={28} className="shrink-0" />
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-mist">
            {COMPANY_NAME}
          </p>
        </div>

        <div className="mt-8 flex flex-col items-start gap-5">
          {card.photo_url ? (
            // Admin-supplied https URL on any host, so next/image's allowlist can't apply.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={card.photo_url}
              alt={`Photo of ${name}`}
              width={96}
              height={96}
              referrerPolicy="no-referrer"
              className="h-24 w-24 rounded-full border-2 border-white/80 object-cover"
            />
          ) : (
            <div
              aria-hidden
              className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-gold font-display text-3xl font-semibold text-white"
            >
              {initials(name)}
            </div>
          )}
          <div>
            <Heading className="font-display text-[32px] font-semibold leading-[1.1] text-white">{name}</Heading>
            {card.job_title && (
              <p className="mt-1.5 text-[15px] text-mist">
                {card.job_title} · {COMPANY_NAME}
              </p>
            )}
          </div>
        </div>
      </header>
      <div className="h-[3px] bg-gold" aria-hidden />

      <Main
        {...(preview ? {} : { id: "main-content", tabIndex: -1 })}
        className="space-y-6 px-6 py-7 outline-none"
      >
        <section>
          <p className="font-display text-[22px] leading-snug text-deep">Ikinagagalak kitang makilala.</p>
          <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-soft">
            Pleased to meet you
          </p>
          {card.bio && <p className="mt-3 text-[15px] leading-relaxed text-ink">{card.bio}</p>}
        </section>

        {/* Primary actions */}
        <section className="space-y-2.5" aria-label="Save this contact">
          {preview ? (
            <span className="flex w-full cursor-default items-center justify-center gap-2 rounded-md border border-coir bg-coir px-4 py-3 text-[15px] font-semibold text-white">
              <Download className="h-4 w-4" aria-hidden />
              Save contact
            </span>
          ) : (
            <a
              href={`${base}/vcard${qs}`}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-coir bg-coir px-4 py-3 text-[15px] font-semibold text-white transition-colors hover:border-coir-dark hover:bg-coir-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-coir/40 focus-visible:ring-offset-2"
            >
              <Download className="h-4 w-4" aria-hidden />
              Save contact
            </a>
          )}
          {(wallet.apple || wallet.google) && (
            <div className="grid grid-cols-2 gap-2.5">
              {wallet.apple && (
                <a
                  href={preview ? undefined : `${base}/wallet/apple${qs}`}
                  className="flex items-center justify-center gap-1.5 rounded-md border border-ink bg-ink px-3 py-2.5 text-[13px] font-semibold text-white"
                >
                  <Wallet className="h-4 w-4" aria-hidden />
                  Apple Wallet
                </a>
              )}
              {wallet.google && (
                <a
                  href={preview ? undefined : `${base}/wallet/google${qs}`}
                  className="flex items-center justify-center gap-1.5 rounded-md border border-line bg-white px-3 py-2.5 text-[13px] font-semibold text-ink"
                >
                  <Wallet className="h-4 w-4" aria-hidden />
                  Google Wallet
                </a>
              )}
            </div>
          )}
        </section>

        {contact.length > 0 && <LinkList title="Contact" rows={contact} rule="border-l-coir" />}
        {links.length > 0 && <LinkList title="Find me online" rows={links} rule="border-l-clay" external />}

        {(card.company_blurb || card.cta_url) && (
          <section className="rounded-[3px] border border-line border-l-4 border-l-gold bg-white p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-soft">
              About {COMPANY_NAME}
            </p>
            {card.company_blurb && (
              <p className="mt-2 text-[14px] leading-relaxed text-ink">{card.company_blurb}</p>
            )}
            {card.cta_url && card.cta_label && (
              <a
                href={card.cta_url}
                target="_blank"
                rel="noopener noreferrer"
                data-track="cta"
                className="mt-3 inline-flex items-center rounded-md border border-coir px-3.5 py-2 text-[13px] font-semibold text-coir-dark transition-colors hover:bg-coir-bg focus:outline-none focus-visible:ring-2 focus-visible:ring-coir/40"
              >
                {card.cta_label} →
              </a>
            )}
          </section>
        )}
      </Main>

      <footer className="bg-ink px-6 py-5 text-[12px] leading-relaxed text-mist">
        <p>
          {COMPANY_NAME} Corporation · Philippines ·{" "}
          <a
            href={COMPANY_WEBSITE}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-gold underline-offset-2"
          >
            bughawinnovations.ph
          </a>
        </p>
        <p className="mt-1 text-[11px] text-mist/75">
          This card shows only what {firstName(name) || "this person"} chose to publish.
        </p>
      </footer>
    </div>
  );
}

function LinkList({
  title,
  rows,
  rule,
  external = false,
}: {
  title: string;
  rows: Row[];
  rule: string;
  external?: boolean;
}) {
  return (
    <section>
      <h2 className="mb-2 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-soft">{title}</h2>
      <ul className={`divide-y divide-line rounded-[3px] border border-line border-l-4 bg-white ${rule}`}>
        {rows.map((row) => {
          const Icon = row.icon;
          return (
            <li key={row.target}>
              <a
                href={row.href}
                data-track={row.target}
                {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-paper focus:outline-none focus-visible:bg-coir-bg"
              >
                <Icon className="h-[18px] w-[18px] shrink-0 text-coir" strokeWidth={1.75} aria-hidden />
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
