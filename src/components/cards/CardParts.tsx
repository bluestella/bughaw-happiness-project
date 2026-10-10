import { cn } from "@/lib/cn";

export const COMPANY_LEGAL_NAME = "Bughaw Innovations Corp.";

/**
 * Name, title and company, centred under the QR. Shared by the admin QR
 * designer and the public card so both read identically.
 */
export function CardIdentity({
  name,
  title,
  as: Heading = "h1",
  className,
}: {
  name: string;
  title?: string;
  as?: "h1" | "h2" | "p";
  className?: string;
}) {
  return (
    <div className={cn("text-center", className)}>
      <Heading className="font-display text-[28px] font-medium leading-tight text-ink sm:text-[30px]">
        {name}
      </Heading>
      {title && <p className="mt-1.5 text-[16px] text-ink-soft">{title}</p>}
      <p className="mt-3 text-[13px] font-bold uppercase tracking-[0.24em] text-deep">{COMPANY_LEGAL_NAME}</p>
    </div>
  );
}

/** Thin green→blue rule with a rising gold sun near its left end. */
export function SunDivider({ className }: { className?: string }) {
  return (
    <div className={cn("relative h-3", className)} aria-hidden>
      <span className="absolute bottom-0 left-9 h-2.5 w-5 overflow-hidden">
        <span className="absolute left-0 top-0 h-5 w-5 rounded-full bg-gold/60" />
      </span>
      <span className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-leaf/70 via-coir/60 to-coir-dark/70" />
    </div>
  );
}

/** Pill used for theme/toggle chips in the designer. */
export function chipClass(active: boolean) {
  return cn(
    "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[14px] font-semibold transition-colors",
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-coir/40",
    active
      ? "border-coir bg-coir-bg text-coir-dark"
      : "border-line bg-white text-ink-soft hover:border-ink-soft hover:text-ink"
  );
}

export const primaryGradientButton =
  "flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-leaf via-coir to-coir-dark px-5 py-3.5 text-[15px] font-semibold text-white transition-opacity hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-coir/40 focus-visible:ring-offset-2 disabled:opacity-50";

export const secondaryButton =
  "flex w-full items-center justify-center gap-2 rounded-2xl border border-line bg-white px-5 py-3 text-[15px] font-semibold text-ink transition-colors hover:border-ink-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-coir/40 disabled:opacity-50";
