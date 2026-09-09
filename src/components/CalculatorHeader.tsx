import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Shared header for calculator/tool pages — icon + eyebrow + display title +
 * description, with optional action row (e.g. "Reset to defaults") and an
 * optional `aside` slot for page-specific content (e.g. pipeline's checkpoint
 * card) that sits beside the text block on wide screens.
 */
export function CalculatorHeader({
  icon: Icon,
  eyebrow,
  title,
  description,
  action,
  aside,
  className,
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  aside?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "mb-6 border-b border-line pb-5",
        aside ? "flex flex-wrap items-end justify-between gap-4" : undefined,
        className
      )}
    >
      <div>
        <div className="mb-1.5 flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-coir-bg text-coir-dark">
            <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
          </span>
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-coir">
            {eyebrow}
          </p>
        </div>
        <h1 className="mb-1.5 font-display text-2xl sm:text-3xl font-semibold tracking-tight text-ink">
          {title}
        </h1>
        {description && <p className="max-w-2xl text-sm text-ink-soft">{description}</p>}
        {action}
      </div>
      {aside}
    </header>
  );
}
