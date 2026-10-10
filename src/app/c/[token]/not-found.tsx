import Image from "next/image";
import { COMPANY_NAME, COMPANY_WEBSITE } from "@/lib/cards";

// Same response for unknown, draft, suspended and rotated tokens, so the page
// never reveals whether a card exists.
export default function CardNotFound() {
  return (
    <div className="mx-auto w-full max-w-[440px] overflow-hidden bg-paper sm:my-8 sm:rounded-[3px] sm:border sm:border-line">
      <header className="bg-deep px-6 py-6">
        <div className="flex items-center gap-2.5">
          <Image src="/brand/logo-mark.png" alt="" width={28} height={28} />
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-mist">{COMPANY_NAME}</p>
        </div>
      </header>
      <div className="h-[3px] bg-gold" aria-hidden />
      <main id="main-content" tabIndex={-1} className="px-6 py-10 outline-none">
        <h1 className="font-display text-[26px] font-semibold leading-tight text-deep">
          This card isn’t available.
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink">
          The link may have expired or been replaced. Ask the person who shared it for a new one, or
          reach the team through our website.
        </p>
        <a
          href={COMPANY_WEBSITE}
          className="mt-6 inline-flex items-center rounded-md border border-coir bg-coir px-4 py-2.5 text-[14px] font-semibold text-white hover:bg-coir-dark"
        >
          Visit bughawinnovations.ph
        </a>
      </main>
    </div>
  );
}
