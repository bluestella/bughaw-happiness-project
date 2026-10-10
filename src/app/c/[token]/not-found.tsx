import { COMPANY_WEBSITE } from "@/lib/cards";
import { CardIdentity, SunDivider, primaryGradientButton } from "@/components/cards/CardParts";

// Same response for unknown, draft, suspended and rotated tokens, so the page
// never reveals whether a card exists.
export default function CardNotFound() {
  return (
    <div className="min-h-screen bg-frost px-4 py-6 sm:py-10">
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-[460px] rounded-[28px] border border-line/80 bg-white px-6 pb-7 pt-8 outline-none sm:px-8"
      >
        <CardIdentity name="This card isn’t available." as="h1" />
        <SunDivider className="mt-6" />
        <p className="mt-5 text-center text-[15px] leading-relaxed text-ink">
          The link may have expired or been replaced. Ask the person who shared it for a new one, or reach
          the team through our website.
        </p>
        <a href={COMPANY_WEBSITE} className={`${primaryGradientButton} mt-6`}>
          Visit bughawinnovations.ph
        </a>
      </main>
    </div>
  );
}
