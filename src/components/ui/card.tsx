import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Featured tier — flagship/hand-built tools. Roomier, more visual weight,
 * meant to be used sparingly (a handful of items per page, not a long list).
 */
export function FeaturedCard({
  href,
  icon: Icon,
  name,
  description,
  size = "md",
  className,
}: {
  href: string;
  icon: LucideIcon;
  name: string;
  description: string;
  /** "lg" spans more visual weight — reserve for one "primary" item per section. */
  size?: "md" | "lg";
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group block rounded-xl border border-line bg-panel shadow-card transition-all duration-200 ease-out-strong",
        "[@media(hover:hover)]:hover:-translate-y-0.5 [@media(hover:hover)]:hover:border-coir/40 [@media(hover:hover)]:hover:shadow-card-hover motion-reduce:hover:translate-y-0",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-coir/30",
        size === "lg" ? "p-6" : "p-5",
        className
      )}
    >
      <span
        className={cn(
          "mb-4 flex items-center justify-center rounded-lg bg-coir-bg text-coir-dark",
          size === "lg" ? "h-11 w-11" : "h-9 w-9"
        )}
      >
        <Icon className={size === "lg" ? "h-6 w-6" : "h-5 w-5"} strokeWidth={1.75} aria-hidden />
      </span>
      <p
        className={cn(
          "mb-1.5 font-display font-semibold text-ink group-hover:text-coir-dark transition-colors",
          size === "lg" ? "text-xl" : "text-base"
        )}
      >
        {name}
      </p>
      <p className={cn("leading-relaxed text-ink-soft", size === "lg" ? "text-sm" : "text-xs")}>
        {description}
      </p>
    </Link>
  );
}

/**
 * Catalog tier — long-tail items meant to be scanned as a dense list, not
 * browsed as individually-weighted cards. Use inside a `divide-y` container.
 */
export function CatalogRow({
  href,
  icon: Icon,
  name,
  description,
  tag,
  className,
}: {
  href: string;
  icon: LucideIcon;
  name: string;
  description: string;
  tag?: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-paper",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-coir/30 focus-visible:ring-inset",
        className
      )}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-coir-bg text-coir-dark">
        <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[13.5px] font-semibold text-ink group-hover:text-coir-dark transition-colors">
            {name}
          </span>
          {tag && (
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-soft">
              {tag}
            </span>
          )}
        </span>
        <span className="block truncate text-xs text-ink-soft">{description}</span>
      </span>
    </Link>
  );
}
