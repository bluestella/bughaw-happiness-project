import { cn } from "@/lib/cn";

/**
 * Section header with real display-type presence — the editorial "pull
 * quote" moment, distinct from the plain text-lg h2 used elsewhere. Reserve
 * for a handful of high-traffic sections (dashboard, catalog), not every h2.
 */
export function SectionIntro({
  eyebrow,
  title,
  blurb,
  action,
  className,
}: {
  eyebrow?: string;
  title: string;
  blurb?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-5 flex flex-wrap items-end justify-between gap-3", className)}>
      <div>
        {eyebrow && (
          <p className="mb-1 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-soft">
            {eyebrow}
          </p>
        )}
        <h2 className="font-display text-xl sm:text-2xl font-semibold text-ink">{title}</h2>
        {blurb && <p className="mt-1 max-w-xl text-sm text-ink-soft">{blurb}</p>}
      </div>
      {action}
    </div>
  );
}
